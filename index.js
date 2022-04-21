import { Octokit, App } from "octokit";
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import 'dotenv/config'

const octokit = new Octokit({
    userAgent: "my-app/v1.2.3",
    auth: process.env.GITHUB_PERSONAL_TOKEN
});

const getIssues = async (owner, repo) => {
    
    return (await octokit.request("GET /repos/{owner}/{repo}/issues", {
        owner: owner,
        repo: repo,
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

const getProjects = async (owner, repo) => {
    return (await octokit.rest.projects.listForRepo({
        owner,
        repo,
      }));
}

const getProjectColumns = async (id) => {
    return (await octokit.rest.projects.listColumns({
        project_id: id,
      }));
}


const getColumnsCard = async (id) => {
    return (await octokit.rest.projects.listCards({
            column_id: id,
          }));
}

export const getDataFromIssues = async (configFile) => {

    let data = getSettings(configFile);
  
    const issues = (await getIssues(data.repository.owner, data.repository.repo)).filter(issue => issue.milestone?.title === data.repository.milestone);
    const stories = issues.map(issue => ({
        id: issue.number,
        num: issue.number,
        name: issue.title,
        actor: data.progressReport.members.filter(member => member.ghUsername === issue.assignee.login)[0].name,
        need: 'machin',
        description: issue.body,
        dod: issue.labels.map(label => label.name).join(', '),
        charge: '2 J/H'
    }));
    const projects = (await getProjects(data.repository.owner, data.repository.repo)).data;
    const projectsInfo = await Promise.all(projects.map(async (i) => {
        const columns = (await getProjectColumns(i.id)).data;
        const tasks = await Promise.all(columns.map(async (column, j) => {
            const issueNumbers = (await getColumnsCard(column.id)).data.filter(x => x.content_url != undefined).map(x => x.content_url).map(x => parseInt(x.split("/").pop()))
            const tStories = stories.filter(x => issueNumbers.includes(x.num)).map(x => {return {name: x.name, num: x.num}})
            return {num: j + 1, name: column.name, stories: tStories}
        }))
        return { name: i.name, tasks}
    }))
    data.stories = stories
    data.projects = projectsInfo
    data.progressReport.members.map(m => {
        const memberIssues = issues.filter(i => i.assignees.map(a => a.login).includes(m.ghUsername));
        m.tasks = memberIssues.map(issue => ({name: issue.title}));
        return m;
    })
    return data;
}