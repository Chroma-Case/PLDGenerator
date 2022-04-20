import { Octokit, App } from "octokit";
import * as yaml from 'js-yaml';
import * as fs from 'fs';

const getIssues = async (owner, repo) => {
    const octokit = new Octokit({
        userAgent: "my-app/v1.2.3",
    });
    
    return (await octokit.request("GET /repos/{owner}/{repo}/issues", {
        owner: "Chroma-Case",
        repo: "Chromacase",
    })).data;
};

const getSettings = (configFile) => {
    const config = yaml.load(fs.readFileSync(configFile, 'utf8'));
    return {
        repository: config.repository,
        doc: {
            title: config.doc.title,
            object: config.doc.object,
            author: config.doc.author,
            manager: config.doc.manager,
            email: config.doc.email,
            keywords: config.doc.keywords,
            promo: config.doc.promo,
            ver: config.doc.versions,
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

export const getDataFromIssues = async (configFile) => {

    let data = getSettings(configFile);
  
    const issues = (await getIssues()).filter(issue => issue.milestone?.title === data.repository.milestone);

    data.stories = issues.map(issue => ({
        num: issue.number,
        name: issue.title,
        actor: data.progressReport.members.filter(member => member.ghUsername === issue.assignee.login)[0].name,
        need: 'machin',
        description: issue.body,
        dod: issue.labels.map(label => label.name).join(', '),
        charge: '2 J/H'
    }));

    data.progressReport.members.map(m => {
        const memberIssues = issues.filter(i => i.assignees.map(a => a.login).includes(m.ghUsername));
        m.tasks = memberIssues.map(issue => ({name: issue.title}));
        return m;
    })

    

    return data;
}