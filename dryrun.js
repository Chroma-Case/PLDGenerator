

const dataUtils = await import('./index.js');

const data = await dataUtils.getDataFromIssues('./settings.yaml');


console.log(data);