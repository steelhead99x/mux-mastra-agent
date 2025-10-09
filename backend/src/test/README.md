# Mux MCP Integration Tests

This directory contains comprehensive tests to verify that the Mux MCP (Model Context Protocol) integration is working correctly and that data is returned for each step the agents need.

## Overview

The MCP integration tests verify:

- **MCP Client Connections**: Tests that all three MCP clients (Data, Assets, Upload) can connect successfully
- **Tool Availability**: Ensures all required MCP tools are available and properly configured
- **Data Flow**: Verifies that data flows correctly through MCP for analytics, video views, errors, and assets
- **Agent Integration**: Tests that both agents (Mux Analytics Agent and Media Vault Agent) can use MCP tools
- **Error Handling**: Validates fallback mechanisms when MCP fails
- **End-to-End Workflows**: Tests complete workflows using MCP
- **Performance**: Tests concurrent requests and connection stability

## Test Files

- `mux-mcp-integration.test.ts` - Main comprehensive test suite
- `test-mcp-integration.sh` - Test runner script with environment setup

## Running the Tests

### Quick Start

```bash
# Run all MCP integration tests
npm run test:mcp

# Run tests in watch mode
npm run test:mcp:watch

# Run with the test runner script (includes environment setup)
./scripts/test-mcp-integration.sh
```

### Prerequisites

1. **Environment Variables**: Set up your Mux credentials
   ```bash
   export MUX_TOKEN_ID="your_mux_token_id"
   export MUX_TOKEN_SECRET="your_mux_token_secret"
   ```

2. **Dependencies**: Ensure all dependencies are installed
   ```bash
   npm install
   ```

3. **MCP Server**: The tests expect the Mux MCP server to be available via `@mux/mcp`

### Test Configuration

The tests use the following configuration:

- `NODE_ENV=test` - Sets test environment
- `USE_MUX_MCP=true` - Enables MCP usage
- `MUX_CONNECTION_TIMEOUT=60000` - 1 minute timeout for MCP connections
- Test timeout: 120 seconds for MCP operations

## Test Categories

### 1. MCP Client Connection Tests
- Tests connection to Mux Data MCP client
- Tests connection to Mux Assets MCP client  
- Tests connection to Mux Upload MCP client

### 2. MCP Tools Availability Tests
- Verifies required data analytics tools are available
- Verifies required assets management tools are available
- Verifies required upload tools are available

### 3. MCP Data Flow Tests
- Tests analytics data fetching via MCP
- Tests video views data fetching via MCP
- Tests error data fetching via MCP
- Tests assets list fetching via MCP

### 4. Agent Integration Tests
- Verifies Mux Analytics Agent has all required tools
- Verifies Media Vault Agent has all required tools
- Tests agent tool execution with MCP

### 5. Error Handling and Fallback Tests
- Tests graceful handling of MCP connection failures
- Validates fallback to REST API when MCP fails
- Tests MCP response format validation

### 6. End-to-End Workflow Tests
- Tests complete analytics workflow via MCP
- Verifies MCP data consistency across tools
- Tests multiple sequential operations

### 7. Performance and Reliability Tests
- Tests concurrent MCP requests
- Validates MCP connection stability
- Tests multiple sequential operations

## Expected MCP Tools

The tests verify availability of these MCP tools:

### Data Analytics Tools
- `invoke_api_endpoint` - Generic API endpoint invoker
- `list_errors` - List error data
- `list_breakdown_values` - Get metric breakdown values
- `get_overall_values` - Get overall metric values

### Assets Management Tools
- `invoke_api_endpoint` - Generic API endpoint invoker
- `retrieve_video_assets` - Retrieve single asset
- `list_video_assets` - List assets with pagination
- `video.assets.retrieve` - Dotted alias for asset retrieval
- `video.assets.list` - Dotted alias for asset listing

### Upload Tools
- `invoke_api_endpoint` - Generic API endpoint invoker
- `create_video_uploads` - Create new upload
- `retrieve_video_uploads` - Retrieve upload info
- `list_video_uploads` - List uploads
- `video.uploads.create` - Dotted alias for upload creation
- `video.uploads.get` - Dotted alias for upload retrieval
- `video.uploads.list` - Dotted alias for upload listing

## Test Data

The tests use valid Mux API timeframes:
- Start: `1751241600` (June 30, 2025)
- End: `1751328000` (July 1, 2025)

This ensures tests work within Mux API constraints.

## Troubleshooting

### Common Issues

1. **MCP Connection Timeouts**
   - Increase `MUX_CONNECTION_TIMEOUT` environment variable
   - Check network connectivity to Mux services
   - Verify Mux credentials are valid

2. **Missing Tools**
   - Ensure `@mux/mcp` package is installed and up to date
   - Check MCP server configuration
   - Verify environment variables are set correctly

3. **Test Failures**
   - Check Mux API credentials
   - Verify MCP server is running
   - Review test logs for specific error messages

### Debug Mode

Run tests with debug output:
```bash
DEBUG_TESTS=true npm run test:mcp
```

### Mock Mode

If Mux credentials are not available, tests will use mock data and may show warnings but should still pass basic validation tests.

## Integration with CI/CD

These tests can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions step
- name: Run MCP Integration Tests
  run: |
    export MUX_TOKEN_ID=${{ secrets.MUX_TOKEN_ID }}
    export MUX_TOKEN_SECRET=${{ secrets.MUX_TOKEN_SECRET }}
    npm run test:mcp
```

## Contributing

When adding new MCP functionality:

1. Add corresponding tests to `mux-mcp-integration.test.ts`
2. Update this README with new test categories
3. Ensure tests handle both success and failure cases
4. Test with both real MCP connections and fallback scenarios

## Related Files

- `../mcp/mux-data-client.ts` - Data MCP client implementation
- `../mcp/mux-assets-client.ts` - Assets MCP client implementation  
- `../mcp/mux-upload-client.ts` - Upload MCP client implementation
- `../agents/mux-analytics-agent.ts` - Analytics agent using MCP
- `../agents/media-vault-agent.ts` - Media vault agent using MCP
- `../tools/mux-analytics.ts` - Analytics tools with MCP integration
