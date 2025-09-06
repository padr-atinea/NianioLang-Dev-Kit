
const vscode = require("vscode");
const cp = require("child_process");
const path = require("path");
const fs = require("fs/promises");
const os = require("os");

function runGit(args, cwd) {
	return new Promise((resolve, reject) => {
		cp.execFile("git", args, { cwd, encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024 * 256 }, (err, stdout, stderr) => {
			if (err) reject(new Error(stderr || err.message));
			else resolve(stdout);
		});
	});
}

async function getCommitDescription(sha, cwd) {
	return await new Promise((resolve, reject) => {
		cp.execFile("git", ["show", "--no-patch", "--format=%B", sha], { cwd }, (err, stdout, stderr) => {
			if (err) reject(new Error(stderr || err.message));
			else resolve(stdout.trimEnd());
		});
	});
}

async function getFormattedMtime(filePath) {
	const big = await fs.stat(filePath, { bigint: true }).catch(() => null);
	let mtimeNs;
	if (big && typeof big.mtimeNs === "bigint") {
		mtimeNs = big.mtimeNs;
	} else {
		const s = await fs.stat(filePath).catch(() => null);
		if (s) {
			const ms = s?.mtimeMs;
			const baseMs = Math.trunc(ms);
			const nsFrac = Math.round((ms - baseMs) * 1e9);
			mtimeNs = BigInt(baseMs) * 1000000n + BigInt(nsFrac);
		} else {
			mtimeNs = BigInt(0);
		}
	}
	const d = new Date(Number(mtimeNs / 1000000n));
	const y = d.getFullYear();
	const mo = String(d.getMonth() + 1).padStart(2, "0");
	const da = String(d.getDate()).padStart(2, "0");
	const hh = String(d.getHours()).padStart(2, "0");
	const mi = String(d.getMinutes()).padStart(2, "0");
	const ss = String(d.getSeconds()).padStart(2, "0");
	const ns = String(mtimeNs % 1000000000n).padStart(9, "0");
	const tzMin = -d.getTimezoneOffset();
	const tzSign = tzMin >= 0 ? "+" : "-";
	const tzAbs = Math.abs(tzMin);
	const tzH = String(Math.floor(tzAbs / 60)).padStart(2, "0");
	const tzM = String(tzAbs % 60).padStart(2, "0");
	return `${y}-${mo}-${da} ${hh}:${mi}:${ss}.${ns} ${tzSign}${tzH}${tzM}`;
}

function getSystemUserName() {
	try {
		const info = os.userInfo();
		return info.username;
	} catch (e) {
		const name = process.env.LOGNAME || process.env.USER || process.env.LNAME || process.env.USERNAME;
		if (name) return name;
		throw e;
	}
}

function getTimeStamp() {
	const d = new Date();
	const y = d.getFullYear();
	const mo = String(d.getMonth() + 1).padStart(2, "0");
	const da = String(d.getDate()).padStart(2, "0");
	const hh = String(d.getHours()).padStart(2, "0");
	const mi = String(d.getMinutes()).padStart(2, "0");
	return `${y}${mo}${da}${hh}${mi}`;
}

async function generatePatch(commitish) {
	const folders = vscode.workspace.workspaceFolders;
	if (!folders || folders.length === 0) throw new Error("No workspace.");
	const root = folders[0].uri.fsPath;
	const rootFolder = root.split('\\').at(-1).split('_')[0];
	const sha = commitish;
	const patch = await runGit(["show", "-p", sha], root);

	const lines = patch.split(/\r?\n/);
	const cleanedPatch = [];
	const files = [];
	let current = null;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line.startsWith("index ") 
			|| line.startsWith('deleted file mode')
			|| line.startsWith('new file mode')
			|| line.startsWith('---')
			|| line.startsWith('+++')) continue;

		if (line.startsWith("diff --git ")) {
			if (current) files.push(current);
			const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
			const xs = (vscode.workspace.getConfiguration('nianiolang').get('onGeneratePatchFromCommit.listOfExcludedFiles') ?? []).map(x => `-x ${x}`).join(' ');
			const diff_x = `diff ${xs} -Naur`;
			const full_base_path = `${rootFolder}.base/${m[1]}`;
			const full_path = `${rootFolder}/${m[2]}`;
			const time_base = await getFormattedMtime(`${root}.base/${m[1]}`);
			const time = await getFormattedMtime(`${root}/${m[2]}`);
			current = { path: full_path, stat: { add: 0, del: 0, hunks: 0 } };
			cleanedPatch.push(`${diff_x} ${full_base_path} ${full_path}`);
			cleanedPatch.push(`--- ${full_base_path}\t${time_base}`);
			cleanedPatch.push(`+++ ${full_path}\t${time}`);
			continue;
		}
		if (!current) continue;
		cleanedPatch.push(line);

		if (line.startsWith("+")) current.stat.add++;
		else if (line.startsWith("-")) current.stat.del++;
		else if (line.startsWith("@@")) current.stat.hunks++;
	}
	if (current) files.push(current);

	let totalAdd = 0;
	let totalDel = 0;
	const headerLines = [];
	for (let i = 0; i < files.length; i++) {
		const file = files[i];
		totalAdd += file.stat.add;
		totalDel += file.stat.del;
		headerLines.push(`#${`-${file.stat.del}`.padStart(7)}${`+${file.stat.add}`.padStart(7)}${`@${file.stat.hunks}`.padStart(5)}  ${file.path}`);
	}
	// headerLines.sort();
	headerLines.push(`#${`-${totalDel}`.padStart(7)}${`+${totalAdd}`.padStart(7)}       TOTAL`);
	headerLines.push("###", '', '');
	const header = headerLines.join('\n');
	const message = (await runGit(["show", "--no-patch", "--format=%B", sha], root)).trim();
	const formatedMessage = message && vscode.workspace.getConfiguration('nianiolang').get('onGeneratePatchFromCommit.useCommitMessage')
		? message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[Łł]/g, c => (c === "Ł" ? "L" : "l")).replace(/[ \n\t]/g, '_')
		: 'yyy';
	const defaultUri = vscode.Uri.file(path.join(root, `../${rootFolder}_${getTimeStamp()}_${getSystemUserName()}_${formatedMessage}.patch`));
	const target = await vscode.window.showSaveDialog({ defaultUri, filters: { Patch: ["patch", "diff", "txt"] } });
	if (!target) return;
	const full = Buffer.from(header + cleanedPatch.join('\n'), "utf8");
	await vscode.workspace.fs.writeFile(target, full);
	await vscode.window.showTextDocument(target, { preview: false });
}

async function generate(...args) {
	try {
		const guess = args && args.length > 1 ? args[1].id : undefined;
		let commit = guess;
		if (!commit) {
			const input = await vscode.window.showInputBox({ prompt: "Commit SHA", value: "HEAD" });
			if (!input) return;
			commit = input.trim();
		}
		await generatePatch(commit);
	} catch (e) {
		const msg = e && e.message ? e.message : String(e);
		vscode.window.showErrorMessage("Nianiolang: Generate Patch failed: " + msg);
	}
}

module.exports = { generate };