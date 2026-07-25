// One-time (or as-needed) script to register the /approve and /deny slash
// commands with Discord. Run with: npm run register-commands
//
// Requires these environment variables (put them in a local .env and load
// with `node --env-file=.env scripts/register-commands.mjs`, or export them
// in your shell first):
//   DISCORD_APP_ID     - Application ID, from the Developer Portal
//   DISCORD_BOT_TOKEN  - Bot token, from the Bot tab
//   DISCORD_GUILD_ID   - (optional) your server's ID, for instant guild-scoped
//                        commands while testing. Omit to register global
//                        commands instead (can take up to an hour to appear).

const appId = process.env.DISCORD_APP_ID;
const botToken = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;

if (!appId || !botToken) {
	console.error("Set DISCORD_APP_ID and DISCORD_BOT_TOKEN environment variables first.");
	process.exit(1);
}

const commands = [
	{
		name: "approve",
		description: "Approve a pending character submission into the crew manifest.",
		options: [
			{
				name: "id",
				description: "Submission ID from the review message.",
				type: 3, // STRING
				required: true
			},
			{
				name: "division",
				description: "Override the division (must match a manifest section title exactly).",
				type: 3,
				required: false
			}
		]
	},
	{
		name: "deny",
		description: "Deny/remove a pending character submission.",
		options: [
			{
				name: "id",
				description: "Submission ID from the review message.",
				type: 3,
				required: true
			},
			{
				name: "reason",
				description: "Optional reason to include in the confirmation message.",
				type: 3,
				required: false
			}
		]
	}
];

const url = guildId
	? `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`
	: `https://discord.com/api/v10/applications/${appId}/commands`;

const res = await fetch(url, {
	method: "PUT",
	headers: {
		Authorization: `Bot ${botToken}`,
		"Content-Type": "application/json"
	},
	body: JSON.stringify(commands)
});

if (!res.ok) {
	console.error(`Failed: ${res.status}`, await res.text());
	process.exit(1);
}

console.log(
	`Registered ${commands.length} command(s) ${guildId ? `for guild ${guildId}` : "globally"}.`
);
