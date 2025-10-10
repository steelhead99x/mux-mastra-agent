// Custom instrumentation file for Mastra
// This file is detected and bundled by Mastra instead of the default instrumentation

// Set telemetry flag to indicate instrumentation is loaded
globalThis.___MASTRA_TELEMETRY___ = true;

console.log('[Mastra] Custom instrumentation loaded - telemetry disabled');

// No-op: Telemetry is disabled for this project
// If you want to enable telemetry in the future, configure it here following the Mastra docs:
// https://docs.mastra.ai/docs/observability/otel-tracing

