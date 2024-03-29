import { Octokit, App } from "octokit";
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import 'dotenv/config'
import moment from 'moment';

const octokit = new Octokit({
    userAgent: "my-app/v1.2.3",
    auth: process.env.GITHUB_PERSONAL_TOKEN
});

moment.locale('fr');

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

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

const getMilestoneIssues = async (owner, repo, milestoneNumber) => {

    const iterator = octokit.paginate.iterator(octokit.rest.issues.listForRepo, {
        owner: owner,
        repo: repo,
        state: "all",
        per_page: 100,
    });

    let total_issues = [];

    for await (const { data: issues } of iterator) {
        total_issues = total_issues.concat(issues);
    }

    return total_issues.filter(i => i.milestone && i.milestone.number === milestoneNumber && !("pull_request" in i));
};

const getSettings = (configFile) => {
    const config = yaml.load(fs.readFileSync(configFile, 'utf8'));
    return {
        members: config.members.map(m => ({name: m.name, ghUsername: m.ghUsername})),
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
        sprint: config.sprint,
        lastSprintSummary: config.lastSprintSummary,
        progressReport: {
            summary: config.progressReport.summary,
            blockingPoints: config.progressReport.blockingPoints,
            conclusion: config.progressReport.conclusion,
            members: config.members.map(m => ({name: m.name, ghUsername: m.ghUsername, tasks: [], chargeDone: 0, chargeTotal: 0})),
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


const getColumnCards = async (id) => {
    return (await octokit.rest.projects.listCards({
            column_id: id,
          }));
}

const getProjectIssues = async (id) => {
    let t =  await Promise.all((await getProjectColumns(id)).data.flatMap(async c => {
        const b = (await getColumnCards(c.id)).data;
        return b;
    }));
    return t.flat();
}

const reorderProjectIssuesByLabel = (issues) => {
    const reordered = {};
    issues.forEach(i => {
        if (i.labels.length > 0) {
            const label = i.labels[0];
            if (!reordered[label]) {
                reordered[label] = [];
            }
            reordered[label].push(i);
        }
    });
    return reordered;
}

const getTimeChargeData = (timeChargeDatyBody) => {
    const l = timeChargeDatyBody;
    let timeCharge = 0;
    let timeChargeDone = 0;
    const parts = l.split("/");
    if (parts.length === 3) {
        const [a, b, _c] = parts;
        timeCharge += parseFloat(b);
        timeChargeDone += parseFloat(a);
        return {timeCharge, timeChargeDone: timeChargeDone < 0 ? 0 : timeChargeDone};
    }
    timeCharge += parseFloat(l);
    return {timeCharge, timeChargeDone};
}

export const getDataFromIssues = async (configFile) => {

    const data = getSettings(configFile);
  
    let issues = (await getMilestoneIssues(data.repository.owner, data.repository.repo, parseInt(data.repository.milestoneNum)));
    data.ignoredIssues = [];
    issues = issues.filter(i => {
        if (!i.labels.length) return true;
        if (!i.labels.some(l => data.repository.ignoredLabels.includes(l.name))) {
            return true;
        }
        data.ignoredIssues.push(i);
        return false;
    })

    let stories = issues.map((issue) => {
        try {
        const parsed = parseIssueBody(issue.body);
        const {timeCharge, timeChargeDone} = getTimeChargeData(parsed.timeCharge);
        issue.assignees.forEach(a => {
            const member = data.progressReport.members.find(m => m.ghUsername === a.login);
            if (!member) {
                return;
            }
            if (timeChargeDone > 0) {
                member.chargeDone += timeChargeDone / issue.assignees.length;
            } else if (issue.state === "closed") {
                member.chargeDone += timeCharge / issue.assignees.length;
            }
            member.chargeTotal += timeCharge / issue.assignees.length;
        });
        return {
        id: issue.number,
        num: '',
        name: issue.title,
        actor: parsed.actor,
        need: parsed.need,
        description: parsed.description.split('\n').map(l => ({line: l})),
        dod: parsed.dod.split('\n').map(l => ({line: l})),
        // timeCharge ex : "2J/H", "0.6 J/H"
        charge: timeCharge,
        done: issue.state === 'closed',
        labels: issue.labels.map(l => l.name),
        assignees: issue.assignees.map(a => data.members.find(m => m.ghUsername === a.login)?.name ?? a.login).join(', '),
    }}
    catch (e) {
        console.log("Error parsing issue " + issue.number);
        console.log(e);
        return null;
    }}).filter(i => i !== null);
    const projects = (await getProjects(data.repository.owner, data.repository.repo)).data;

    const projectIssues = await Promise.all(projects.map(async p => {
        const taskObj = reorderProjectIssuesByLabel((await getProjectIssues(p.id)).map((c) => {
            return stories.find(s => parseInt(c.content_url.split("/").pop()) === s.id);
        }).filter(s => s !== undefined));
        if (taskObj.length === 0) {
            return null;
        }
        let taskInc = 0;
        const projectTasks = Object.entries(taskObj).map(([taskName, taskStories]) => {
            taskInc++;
            let inc = 0;
            let tasksStoriesNum = [];

            // updating by reference stories num
            taskStories.forEach(s => {
                inc++;
                s.num = `${p.name} - ${taskInc}.${inc}`;
                tasksStoriesNum.push(`${taskInc}.${inc}`);
            });

            return ({
                name: taskName,
                stories: taskStories.map((v, i) => ({...v, num: tasksStoriesNum[i]})),
                num: taskInc,
                charge: taskStories.reduce((acc, s) => acc + s.charge, 0),
            });
        });
        return {
            tasks: projectTasks,
            name: p.name,
            charge: projectTasks.reduce((acc, t) => acc + t.charge, 0),
        };
    }));

    data.projects = projectIssues;
    data.sprintCharge = projectIssues.reduce((acc, s) => acc + s.charge, 0);

    data.stories = stories.sort((a, b) => {
        // elements with num are at the start of the list
        if (a.num != '' && b.num == '') return -1;
        if (a.num == '' && b.num != '') return 1;
        if (a.num == '' && b.num == '') return 0;
        return a.num.localeCompare(b.num);
    });
    //data.projects = projectsInfo.filter(pI => {
    //    return pI.tasks.filter(t => t.stories.length > 0).length > 0;
    //});
    data.progressReport.members.map(m => {
        const memberIssues = issues.filter(i => i.assignees.map(a => a.login).includes(m.ghUsername));
        m.tasks = memberIssues.map(issue => ({name: issue.title, done: issue.state === 'closed'}));
        return m;
    })
    {
        const parseDateFormat = "DD-MM-YYYY";
        const dateStart = moment(data.sprint.start, parseDateFormat);
        const dateEnd = moment(data.sprint.end, parseDateFormat);
        const displayFormat = (dateStart.format("YYYY") === dateEnd.format("YYYY")) ? 'MMMM' : 'MMMM YYYY';
        data.sprint.displayTimePeriod = `${capitalizeFirstLetter(dateStart.format(displayFormat))} - ${capitalizeFirstLetter(dateEnd.format('MMMM YYYY'))}`;
    }
    return data;
}

// print the summary of the PLD in a table
// one member per line, with the number of tasks done and the number of tasks total and their charge in J/H
// print ignored issues and if they're closed or not
export const printSummarizePLD = (data) => {
    console.log("Summary of the PLD, milestone : " + data.repository.milestoneNum);
    console.log(`
    Number of stories: ${data.stories.length}
    ${data.sprint.displayTimePeriod}
    ${data.sprintCharge} J/H
    `);
    console.log(`Ignored issues (${data.ignoredIssues.length})`);
    data.ignoredIssues.forEach(i => {
        console.log(`${i.state.padEnd(5)} - ${i.title}`);
    });
    console.log("");
    console.log(`Members (${data.progressReport.members.length})`);
    data.progressReport.members.forEach(m => {
        console.log(`${m.name.padEnd(30)} - ${m.chargeDone.toString().padStart(3)} / ${m.chargeTotal.toString().padEnd(3)} J/H   ${m.tasks.length.toString().padEnd(2)} tasks`);
    });
}