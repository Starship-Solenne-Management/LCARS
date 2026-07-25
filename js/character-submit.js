/*
 * Character submission form handler.
 * Posts the form data to the Cloudflare Worker endpoint, which relays it
 * to the staff Discord channel and stages it for approval via slash
 * commands (see /discord-bot). No secrets live in this file - the Worker
 * holds the Discord webhook/bot token and GitHub credentials.
 */
(function () {
	"use strict";

	// TODO: replace with your deployed Worker URL, e.g.
	// "https://solenne-crew-bot.yourname.workers.dev/submit"
	const SUBMIT_ENDPOINT = "https://REPLACE-WITH-YOUR-WORKER.workers.dev/submit";

	document.addEventListener("DOMContentLoaded", function () {
		const form = document.getElementById("submit-form");
		if (!form) {
			return;
		}

		const statusBox = document.getElementById("submit-status");
		const submitBtn = document.getElementById("submit-btn");

		function showStatus(message, isError) {
			statusBox.textContent = message;
			statusBox.className = isError ? "error" : "success";
		}

		form.addEventListener("submit", function (event) {
			event.preventDefault();

			if (SUBMIT_ENDPOINT.indexOf("REPLACE-WITH-YOUR-WORKER") !== -1) {
				showStatus(
					"Submission form isn't wired up yet - set SUBMIT_ENDPOINT in js/character-submit.js.",
					true
				);
				return;
			}

			const payload = {
				name: form.name.value.trim(),
				rank: form.rank.value.trim(),
				position: form.position.value.trim(),
				division: form.division.value,
				doc: form.doc.value.trim(),
				submitter: form.submitter.value.trim()
			};

			if (!payload.name || !payload.position || !payload.division) {
				showStatus("Please fill in at least Character Name, Position, and Division.", true);
				return;
			}

			submitBtn.disabled = true;
			showStatus("Submitting\u2026", false);

			fetch(SUBMIT_ENDPOINT, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload)
			})
				.then(function (response) {
					if (!response.ok) {
						return response.json().catch(function () {
							return {};
						}).then(function (body) {
							throw new Error(body.error || "Submission failed (" + response.status + ")");
						});
					}
					return response.json();
				})
				.then(function () {
					showStatus(
						"Submitted! A staff member will review your character in Discord shortly.",
						false
					);
					form.reset();
				})
				.catch(function (err) {
					showStatus(err.message || "Something went wrong submitting your character.", true);
				})
				.finally(function () {
					submitBtn.disabled = false;
				});
		});
	});
})();
