import { verifyKey } from "discord-interactions";

const GITHUB_API = "https://api.github.com";
const DISCORD_API = "https://discord.com/api/v10";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function corsHeaders(env) {
	return {
		"Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
		"Access-Control-Allow-Methods": "POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type"
	};
}

function json(data, init, env) {
	return new Response(JSON.stringify(data), {
		...init,
		headers: {
			"Content-Type": "application/json",
			...(env ? corsHeaders(env) : {}),
			...(init && init.headers ? init.headers : {})
		}
	});
}

function b64encode(str) {
	// Encode a UTF-8 string to base64 (Workers runtime has btoa, but it's
	// Latin1-only, so go through TextEncoder + a byte-safe conversion).
	const bytes = new TextEncoder().encode(str);
	let binary = "";
	bytes.forEach((b) => {
		binary += String.fromCharCode(b);
	});
	return btoa(binary);
}

function b64decode(b64) {
	const binary = atob(b64.replace(/\n/g, ""));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return new TextDecoder().decode(bytes);
}

function shortId() {
	return crypto.randomUUID().split("-")[0];
}

// ---------------------------------------------------------------------------
// GitHub Contents API helpers
// ---------------------------------------------------------------------------

function githubHeaders(env) {
	return {
		Authorization: `Bearer ${env.GITHUB_TOKEN}`,
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
		"User-Agent": "solenne-crew-bot"
	};
}

async function githubGetFile(env, path) {
	const url = `${GITHUB_API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}?ref=${env.GITHUB_BRANCH}`;
	const res = await fetch(url, { headers: githubHeaders(env) });
	if (res.status === 404) {
		return null;
	}
	if (!res.ok) {
		throw new Error(`GitHub GET ${path} failed: ${res.status} ${await res.text()}`);
	}
	const data = await res.json();
	return { sha: data.sha, content: b64decode(data.content) };
}

async function githubPutFile(env, path, content, message, sha) {
	const url = `${GITHUB_API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;
	const res = await fetch(url, {
		method: "PUT",
		headers: { ...githubHeaders(env), "Content-Type": "application/json" },
		body: JSON.stringify({
			message,
			content: b64encode(content),
			branch: env.GITHUB_BRANCH,
			...(sha ? { sha } : {})
		})
	});
	if (!res.ok) {
		throw new Error(`GitHub PUT ${path} failed: ${res.status} ${await res.text()}`);
	}
	return res.json();
}

async function githubDeleteFile(env, path, message, sha) {
	const url = `${GITHUB_API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;
	const res = await fetch(url, {
		method: "DELETE",
		headers: { ...githubHeaders(env), "Content-Type": "application/json" },
		body: JSON.stringify({ message, sha, branch: env.GITHUB_BRANCH })
	});
	if (!res.ok) {
		throw new Error(`GitHub DELETE ${path} failed: ${res.status} ${await res.text()}`);
	}
	return res.json();
}

// ---------------------------------------------------------------------------
// Discord REST helpers
// ---------------------------------------------------------------------------

async function postChannelMessage(env, body) {
	const res = await fetch(`${DISCORD_API}/channels/${env.DISCORD_CHANNEL_ID}/messages`, {
		method: "POST",
		headers: {
			Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
			"Content-Type": "application/json"
		},
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		throw new Error(`Discord postChannelMessage failed: ${res.status} ${await res.text()}`);
	}
	return res.json();
}

async function editDeferredResponse(env, applicationId, interactionToken, body) {
	const res = await fetch(
		`${DISCORD_API}/webhooks/${applicationId}/${interactionToken}/messages/@original`,
		{
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body)
		}
	);
	if (!res.ok) {
		console.error("Failed to edit deferred response", res.status, await res.text());
	}
	return res;
}

function getOption(options, name) {
	const opt = (options || []).find((o) => o.name === name);
	return opt ? opt.value : undefined;
}

// ---------------------------------------------------------------------------
// /submit - called by the character submission form on the site
// ---------------------------------------------------------------------------

async function handleSubmit(request, env) {
	let payload;
	try {
		payload = await request.json();
	} catch {
		return json({ error: "Invalid JSON body." }, { status: 400 }, env);
	}

	const name = (payload.name || "").trim();
	const rank = (payload.rank || "").trim();
	const position = (payload.position || "").trim();
	const division = (payload.division || "").trim();
	const doc = (payload.doc || "").trim();
	const submitter = (payload.submitter || "").trim();

	if (!name || !position || !division) {
		return json({ error: "name, position, and division are required." }, { status: 400 }, env);
	}
	if (name.length > 80 || position.length > 80 || rank.length > 40 || division.length > 80) {
		return json({ error: "One or more fields are too long." }, { status: 400 }, env);
	}
	if (doc && !/^https?:\/\//i.test(doc)) {
		return json({ error: "Doc link must be a valid URL." }, { status: 400 }, env);
	}

	const id = shortId();
	const pending = {
		id,
		name,
		rank,
		position,
		division,
		doc,
		submitter,
		submittedAt: new Date().toISOString()
	};

	try {
		await githubPutFile(
			env,
			`data/pending/${id}.json`,
			JSON.stringify(pending, null, 2) + "\n",
			`Character submission ${id}: ${name}`
		);

		await postChannelMessage(env, {
			embeds: [
				{
					title: "New Character Submission",
					color: 0xe9c538,
					fields: [
						{ name: "Name", value: name, inline: true },
						{ name: "Rank", value: rank || "\u2014", inline: true },
						{ name: "Position", value: position, inline: true },
						{ name: "Division", value: division, inline: true },
						{ name: "Doc", value: doc ? `[Link](${doc})` : "\u2014", inline: true },
						{ name: "Submitted by", value: submitter || "\u2014", inline: true },
						{ name: "Submission ID", value: `\`${id}\`` }
					],
					footer: {
						text: `Use /approve id:${id} to add them to the manifest, or /deny id:${id} to reject.`
					}
				}
			]
		});
	} catch (err) {
		console.error(err);
		return json({ error: "Failed to record submission. Please try again later." }, { status: 502 }, env);
	}

	return json({ ok: true, id }, { status: 200 }, env);
}

// ---------------------------------------------------------------------------
// /interactions - Discord slash command endpoint (/approve, /deny)
// ---------------------------------------------------------------------------

const InteractionType = { PING: 1, APPLICATION_COMMAND: 2 };
const InteractionResponseType = {
	PONG: 1,
	CHANNEL_MESSAGE_WITH_SOURCE: 4,
	DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5
};
const MessageFlags = { EPHEMERAL: 64 };

async function handleApprove(env, interaction) {
	const options = interaction.data.options;
	const id = getOption(options, "id");
	const divisionOverride = getOption(options, "division");

	const pendingFile = await githubGetFile(env, `data/pending/${id}.json`);
	if (!pendingFile) {
		return { content: `No pending submission found with id \`${id}\`.`, flags: MessageFlags.EPHEMERAL };
	}
	const pending = JSON.parse(pendingFile.content);
	const division = (divisionOverride || pending.division || "").trim();

	const crewFile = await githubGetFile(env, "data/crew.json");
	if (!crewFile) {
		return { content: "data/crew.json is missing from the repo.", flags: MessageFlags.EPHEMERAL };
	}
	const crew = JSON.parse(crewFile.content);

	let section = null;
	for (const row of crew.rows || []) {
		for (const s of row) {
			if (s.title.toLowerCase() === division.toLowerCase()) {
				section = s;
				break;
			}
		}
		if (section) break;
	}

	if (!section) {
		return {
			content: `Couldn't find a division called "${division}". Try /approve id:${id} division:"Exact Division Name".`,
			flags: MessageFlags.EPHEMERAL
		};
	}

	const displayName = pending.rank ? `${pending.rank} ${pending.name}`.trim() : pending.name;
	const member = { name: displayName, notes: pending.position };
	if (pending.doc) {
		member.link = pending.doc;
	}
	section.members = section.members || [];
	section.members.push(member);

	await githubPutFile(
		env,
		"data/crew.json",
		JSON.stringify(crew, null, 2) + "\n",
		`Approve character: ${displayName} (${section.title})`,
		crewFile.sha
	);
	await githubDeleteFile(
		env,
		`data/pending/${id}.json`,
		`Remove approved pending submission ${id}`,
		pendingFile.sha
	);

	return { content: `\u2705 Approved **${displayName}** into **${section.title}**.` };
}

async function handleDeny(env, interaction) {
	const options = interaction.data.options;
	const id = getOption(options, "id");
	const reason = getOption(options, "reason");

	const pendingFile = await githubGetFile(env, `data/pending/${id}.json`);
	if (!pendingFile) {
		return { content: `No pending submission found with id \`${id}\`.`, flags: MessageFlags.EPHEMERAL };
	}
	const pending = JSON.parse(pendingFile.content);

	await githubDeleteFile(
		env,
		`data/pending/${id}.json`,
		`Deny pending submission ${id}`,
		pendingFile.sha
	);

	return {
		content: `\u274c Denied submission \`${id}\` (${pending.name})${reason ? ` - ${reason}` : ""}.`
	};
}

async function handleInteractions(request, env, ctx) {
	const signature = request.headers.get("x-signature-ed25519");
	const timestamp = request.headers.get("x-signature-timestamp");
	const body = await request.text();

	const isValid =
		signature &&
		timestamp &&
		(await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY));

	if (!isValid) {
		return new Response("Bad request signature.", { status: 401 });
	}

	const interaction = JSON.parse(body);

	if (interaction.type === InteractionType.PING) {
		return json({ type: InteractionResponseType.PONG });
	}

	if (interaction.type === InteractionType.APPLICATION_COMMAND) {
		const commandName = interaction.data.name;

		// Do the slow GitHub work after responding, then patch the message in.
		ctx.waitUntil(
			(async () => {
				let result;
				try {
					if (commandName === "approve") {
						result = await handleApprove(env, interaction);
					} else if (commandName === "deny") {
						result = await handleDeny(env, interaction);
					} else {
						result = { content: `Unknown command: ${commandName}` };
					}
				} catch (err) {
					console.error(err);
					result = { content: `Something went wrong: ${err.message}` };
				}
				await editDeferredResponse(
					env,
					interaction.application_id,
					interaction.token,
					{ content: result.content }
				);
			})()
		);

		return json({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });
	}

	return json({ error: "Unhandled interaction type." }, { status: 400 });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		if (request.method === "OPTIONS") {
			return new Response(null, { headers: corsHeaders(env) });
		}

		if (url.pathname === "/submit" && request.method === "POST") {
			return handleSubmit(request, env);
		}

		if (url.pathname === "/interactions" && request.method === "POST") {
			return handleInteractions(request, env, ctx);
		}

		return new Response("Not found.", { status: 404 });
	}
};
