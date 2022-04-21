import { Octokit, App } from "octokit";
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import 'dotenv/config'

const octokit = new Octokit({
    userAgent: "my-app/v1.2.3",
    auth: process.env.GITHUB_PERSONAL_TOKEN
});

/*
    Get the value that is under the ### <title> specified by lineNumber until finding another title or the end of the body
*/
const getSectionValueFromBodyIssue = (bodyLines, lineNumber) => {
    let value = "";
    let i = lineNumber;
    if (!bodyLines[i].startsWith("###")) {
        console.error("not having a section title at line " + i);
        return null;
    }
    i++;
    while (i < bodyLines.length && !bodyLines[i].startsWith("###")) {
        value += bodyLines[i] === '' ? '' : bodyLines[i] + "\n";
        i++;
    }
    return value.trim();
}

/*
    parse the body of an issues to get the author, need, time charge, description and DoD
*/
const parseIssueBody = (body) => {
    const lines = body.split("\n");
    const sections = {
        "En tant que": "actor",
        "Je veux": "need",
        "Estimation du temps": "timeCharge",
        "Description": "description",
        "Definition of Done (DoD)": "dod",
    };
    let data = {};
    lines.forEach((line, i) => {
        if (line.startsWith("###")) {
            const section = sections[line.substring(4).trim()];
            if (section) {
                data[section] = getSectionValueFromBodyIssue(lines, i);
            }
        }
    });
    return data;
};

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
    let stories = issues.map(issue => {
        const parsed = parseIssueBody(issue.body);
        return {
        id: issue.number,
        num: '',
        name: issue.title,
        actor: parsed.actor,
        need: parsed.need,
        description: parsed.description.split('\n').map(l => ({line: l})),
        dod: parsed.dod.split('\n').map(l => ({line: l})),
        charge: parsed.timeCharge,
    }});
    const projects = (await getProjects(data.repository.owner, data.repository.repo)).data;
    const projectsInfo = await Promise.all(projects.map(async (i) => {
        const columns = (await getProjectColumns(i.id)).data;
        const tasks = await Promise.all(columns.map(async (column, j) => {
            const issueNumbers = (await getColumnsCard(column.id)).data.filter(x => x.content_url != undefined).map(x => x.content_url).map(x => parseInt(x.split("/").pop()))
            const tStories = stories.filter(x => issueNumbers.includes(x.id)).map((x, i) => ({name: x.name, id: x.id, num: `${j + 1}.${i + 1}`}));

            // we're updating stories numbers to match the order of the tasks (depending on the project and label)
            let inc = 0;
            stories.forEach(story => {
                if (issueNumbers.includes(story.id)) {
                    story.num = `${i.name} - ${j + 1}.${inc++ + 1}`;
                }
            });

            return {num: j + 1, name: column.name, stories: tStories}
        }))
        return { name: i.name, tasks}
    }))
    data.stories = stories.sort((a, b) => {
        // elements with num are at the start of the list
        if (a.num != '' && b.num == '') return -1;
        if (a.num == '' && b.num != '') return 1;
        if (a.num == '' && b.num == '') return 0;
        return a.num.localeCompare(b.num);
    });
    data.projects = projectsInfo.filter(pI => {
        return pI.tasks.filter(t => t.stories.length > 0).length > 0;
    });
    data.progressReport.members.map(m => {
        const memberIssues = issues.filter(i => i.assignees.map(a => a.login).includes(m.ghUsername));
        m.tasks = memberIssues.map(issue => ({name: issue.title}));
        return m;
    })
    return data;
}