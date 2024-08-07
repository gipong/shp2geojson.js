"use strict";

Object.defineProperty(exports, "__esModule", {
	value: true
});
exports.fetchArrayBuffer = fetchArrayBuffer;
exports.fetchText = fetchText;
async function fetchArrayBuffer(url) {
	var response = await fetch(url);
	if (!response.ok) {
		throw new Error("Failed to fetch " + url + ": " + response.status + " " + response.statusText);
	}
	return response.arrayBuffer();
}

async function fetchText(url, encoding) {
	var response = await fetch(url);
	if (!response.ok) {
		throw new Error("Failed to fetch " + url + ": " + response.status + " " + response.statusText);
	}
	return response.text();
}