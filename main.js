import * as fs from 'fs';
import * as carbone from 'carbone';

import prompts from 'prompts';

import { printSummarizePLD } from './index.js';

const main = async () => {
    const dataUtils = await import('./index.js');
    const data = await dataUtils.getDataFromIssues('./settings.yaml');

    printSummarizePLD(data);

    const response = await prompts({
        type: 'text',
        name: 'answer',
        message: 'Do you want to generate a report? (N/y)',
      });
    if (response.answer === 'y' || response.answer === 'Y') {
        carbone.default.render('./pld.odt', data, function(err, result){
        if (err) {
            return console.error(err);
        }
        fs.writeFileSync('result.odt', result);
        });
    }
    
}

main();
