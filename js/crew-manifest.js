/*
 * Renders the crew manifest from data/crew.json.
 * The JSON file is the single source of truth for who's on the roster;
 * it can be safely edited by hand OR by the Discord approval bot
 * (see /discord-bot) without ever touching this page's markup.
 */
(function () {
	"use strict";

	function el(tag, attrs, children) {
		const node = document.createElement(tag);
		if (attrs) {
			Object.keys(attrs).forEach(function (key) {
				node.setAttribute(key, attrs[key]);
			});
		}
		(children || []).forEach(function (child) {
			node.appendChild(child);
		});
		return node;
	}

	function buildMemberItem(member) {
		const li = document.createElement("li");
		li.appendChild(document.createTextNode(member.name));

		const notes = document.createElement("div");
		notes.textContent = member.notes || "";
		li.appendChild(notes);

		if (member.link) {
			const a = document.createElement("a");
			a.href = member.link;
			a.target = "_blank";
			a.rel = "noopener";
			li.appendChild(a);
		}

		return li;
	}

	function buildSection(section) {
		const titleSpanAttrs = section.titleClass ? { class: section.titleClass } : null;
		const titleSpan = el("span", titleSpanAttrs, [document.createTextNode(section.title)]);
		const titleBar = el("div", { class: "lcars-text-bar the-end" }, [titleSpan]);

		const list = el("ul", { class: "crewlist", "data-section": section.title });
		(section.members || []).forEach(function (member) {
			list.appendChild(buildMemberItem(member));
		});

		return el("div", { class: "col" }, [titleBar, list]);
	}

	function renderManifest(data, mount) {
		mount.innerHTML = "";
		(data.rows || []).forEach(function (row, index) {
			if (index > 0) {
				mount.appendChild(document.createElement("br"));
			}
			const flexbox = el("div", { class: "flexbox" });
			row.forEach(function (section) {
				flexbox.appendChild(buildSection(section));
			});
			mount.appendChild(flexbox);
		});
	}

	document.addEventListener("DOMContentLoaded", function () {
		const mount = document.getElementById("crew-manifest");
		if (!mount) {
			return;
		}
		fetch("../data/crew.json", { cache: "no-store" })
			.then(function (response) {
				if (!response.ok) {
					throw new Error("Failed to load crew.json (" + response.status + ")");
				}
				return response.json();
			})
			.then(function (data) {
				renderManifest(data, mount);
			})
			.catch(function (err) {
				mount.innerHTML = "<p class=\"small\">Unable to load crew manifest right now.</p>";
				console.error(err);
			});
	});
})();
