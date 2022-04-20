import { Octokit, App } from "octokit";
const yaml = require('js-yaml');
const fs   = require('fs');

/*
{
            num: "1.1",
            name: 'faire un tour',
            actor: 'Louis Auzuret',
            need: 'dégourdir les jambes',
            description: 'Il faut faire un tour dans la maison de Louis Auzuret pour se dégourdir les jambes.',
            dod: 'Il faut au moins faire 3km',
            charge: '30 minutes ouvrées',
        },
*/

const getIssues = async (owner, repo) => {
    const octokit = new Octokit({
        userAgent: "my-app/v1.2.3",
    });
    
    return (await octokit.request("GET /repos/{owner}/{repo}/issues", {
        owner: "Chroma-Case",
        repo: "Chromacase",
    })).data;
};

const getSettings = async (configFile) => {
    const config = yaml.safeLoad(fs.readFileSync(configFile, 'utf8'));
    return {
        milestone: config.milestone,
        doc: {
            title: config.doc.title,
            object: config.doc.object,
            author: config.doc.author,
            manager: config.doc.manager,
            email: config.doc.email,
            keywords: config.doc.keywords,
            promo: config.doc.promo,
            ver: config.doc.ver,
        },
        progressReport: {
            summary: config.progressReport.summary,
            blockingPoints: config.progressReport.blockingPoints,
            conclusion: config.progressReport.conclusion,
            members: config.members.map(m => ({name: m.name, ghUsername: m.ghUsername, tasks: []})),
        },
        projects: []
    }
}

const getDataFromIssues = async () => {

    let data = getSettings('../settings.yaml');
  
    const issues = await getIssues().filter(issue => issue.milestone.title === data.milestone.title);

    data.stories = issues.map(issue => ({
        num: issue.number,
        name: issue.title,
        actor: issue.assignees.map(assignee => assignee.login).join(', '),
        need: 'machin',
        description: issue.body,
        dod: issue.labels.map(label => label.name).join(', '),
        charge: '2 J/H'
    }));

    data.progressReport.members = data.members.map(m => {
        const memberIssues = issues.filter(i => i.assignees === m.ghUsername);
        if (member) {
            m.tasks = member.tasks;
        }
        return m;
    })

    

    
}


getDataFromIssues();