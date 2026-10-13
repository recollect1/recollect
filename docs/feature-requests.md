# Feature requests for Amazon

## 1. Consented on-device acoustic features for health and care add-ons — Important

A real Alexa+ add-on receives transcript text, not audio. For care add-ons the timing of speech
matters as much as the words: pause rate, mean pause length, speech rate and voiced-time ratio.

**Request:** with explicit consent from the user, let an add-on receive per-utterance acoustic
*statistics* computed on the device — not audio. For example: utterance duration, voiced duration,
number and total length of pauses of 0.5 s or more, word count.

**Why statistics and not audio:** nothing identifiable leaves the device, the payload is a few
numbers, and the consent is easy to explain. Recollect's full-voice mode shows what this enables,
but today it can only run in our own simulator.

## 2. A public Alexa+ web simulator for builders — Important

To build and test this add-on we had to write our own Echo-Show-style MCP client. A hosted
simulator that connects to a remote MCP server, shows tool calls with timings and renders MCP Apps
cards would let builders test against real Alexa+ behaviour, including the tool round-trip budget.
