import * as fs from 'fs';
import * as carbone from 'carbone';

const dataUtils = await import('./index.js');

const data = await dataUtils.getDataFromIssues('./settings.yaml');

// Data to inject

// Generate a report using the sample template provided by carbone module
// This LibreOffice template contains "Hello {d.firstname} {d.lastname} !"
// Of course, you can create your own templates!
carbone.default.render('./pld.odt', data, function(err, result){
if (err) {
    return console.error(err);
}
    // write the result
    fs.writeFileSync('result.odt', result);
});
