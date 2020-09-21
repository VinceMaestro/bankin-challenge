const dotenv = require('dotenv');
const superagent = require('superagent');

dotenv.config();

const endpoint = 'localhost:3000';

function getRefreshToken() {
  const basicCredentials = `Basic ${Buffer.from(`${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`).toString('base64')}`;

  return superagent.post(`${endpoint}/login`)
    .send({ user: process.env.USER_LOGIN, password: process.env.USER_PASSWORD })
    .set('authorization', basicCredentials)
    .then((res) => res.body.refresh_token);
}

function getAccessToken(refreshToken) {
  return superagent.post(`${endpoint}/token`)
    .send({ grant_type: 'refresh_token', refresh_token: refreshToken })
    .then((res) => res.body.access_token);
}

function getPage(accessToken, pageLink) {
  return superagent.get(`${endpoint}${pageLink}`)
    .set('authorization', `Bearer ${accessToken}`)
    .then((res) => res.body);
}

function filterDuplicateEntries(pageName, currPage, idMapAndPagesAggregate) {
  const uniqueKey = pageName === 'account' ? 'acc_number' : 'id';

  const uniqueEntriesIdMap = {};
  const uniqueEntries = currPage[pageName].filter((entry) => {
    const isUniqueId = !idMapAndPagesAggregate.idMap[entry[uniqueKey]];
    if (isUniqueId) {
      uniqueEntriesIdMap[entry[uniqueKey]] = true;

      return true;
    }
    return false;
  });
  return { pagesAggregate: uniqueEntries, idMap: uniqueEntriesIdMap };
}

async function aggregatePages(
  pageName, accessToken, currPageLink, idMapAndPagesAggregate = { pagesAggregate: [], idMap: {} },
) {
  const currPage = await getPage(accessToken, currPageLink);

  const nextPageLink = currPage.link.next;
  const newEntries = filterDuplicateEntries(pageName, currPage, idMapAndPagesAggregate);

  const updatedIdMapAndPagesAggregate = {
    pagesAggregate: idMapAndPagesAggregate.pagesAggregate.concat(newEntries.pagesAggregate),
    idMap: { ...idMapAndPagesAggregate.idMap, ...newEntries.idMap },
  };

  if (nextPageLink) {
    return aggregatePages(pageName, accessToken, nextPageLink, updatedIdMapAndPagesAggregate);
  }

  return updatedIdMapAndPagesAggregate.pagesAggregate;
}

async function getAccounts(accessToken) {
  try {
    const firstPageLink = '/accounts?page=1';
    const accounts = await aggregatePages('account', accessToken, firstPageLink);

    return accounts;
  } catch (err) {
    return { accounts: [] };
  }
}

async function aggregateTransactionsWithAccount(account, accessToken) {
  try {
    const firstPageLink = `/accounts/${account.acc_number}/transactions?page=1`;
    const accountWithTransactions = {
      ...account,
      transactions: await aggregatePages('transactions', accessToken, firstPageLink),
    };

    return accountWithTransactions;
  } catch (err) {
    return { ...account, transactions: [] };
  }
}

function getAccountsWithTransactions(accounts, accessToken) {
  return Promise.all(accounts.map(
    (account) => aggregateTransactionsWithAccount(account, accessToken),
  ));
}

(async () => {
  try {
    const refreshToken = await getRefreshToken();
    const accessToken = await getAccessToken(refreshToken);

    const accounts = await getAccounts(accessToken);
    const accountsWithTransactions = await getAccountsWithTransactions(accounts, accessToken);

    console.log(accountsWithTransactions);
  } catch (err) {
    console.error(err);
  }
})();
