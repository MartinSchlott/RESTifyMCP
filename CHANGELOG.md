# Changelog

All notable changes to RESTifyMCP will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-08-05

### Added
- **OpenAPI Server Integration**: RESTifyMCP clients can now expose local REST API servers as MCP tools
- **Dynamic Tool Discovery**: Automatically fetches OpenAPI specifications and converts endpoints to MCP tools
- **Bearer Token Authentication**: Support for authenticated OpenAPI server access
- **Schema Compatibility**: Proper handling of OpenAPI schemas with `additionalProperties` for CustomGPT compatibility
- **Error Resilience**: Graceful handling of OpenAPI fetch failures without affecting other MCP servers

### Changed
- **Enhanced Client Architecture**: Client now supports both MCP servers and OpenAPI servers simultaneously
- **Improved Schema Handling**: OpenAPI schemas are now transferred 1:1 without unnecessary conversion
- **Better Tool Registration**: Tools from multiple sources (MCP + OpenAPI) are properly aggregated

### Fixed
- **CustomGPT Compatibility**: Fixed `UnrecognizedKwargsError` issues by preserving `additionalProperties` in nested objects
- **Schema Conversion**: Removed unnecessary schema conversion that was stripping important OpenAPI properties

### Technical Details
- Added `OpenAPIServerConfig` interface for configuring OpenAPI servers
- Extended `ClientConfig` to include `openApiServers` array
- Implemented `OpenAPIServerManager` for managing OpenAPI server lifecycle
- Added comprehensive logging for debugging OpenAPI integration
- Updated WebSocket server to properly handle tool updates from reconnected clients

## [1.0.0] - 2025-08-01

### Added
- **Initial Release**: Complete RESTifyMCP implementation
- **Three Operating Modes**: Server, Client, and Combo modes
- **Multi-MCP-Server Support**: Single client can connect to multiple MCP servers
- **OpenAPI Generation**: Automatic OpenAPI documentation from MCP server capabilities
- **WebSocket Communication**: Real-time client-server communication
- **Admin Interface**: Web-based administration dashboard
- **API Spaces**: Multi-tenant architecture with bearer token authentication
- **CustomGPT Integration**: Full compatibility with OpenAI's CustomGPT platform

### Features
- REST API server with automatic OpenAPI documentation
- MCP server management via stdio communication
- WebSocket-based tool registration and invocation
- Bearer token authentication for API access
- Admin dashboard for monitoring and management
- Support for multiple client connections
- Comprehensive error handling and logging

## [0.3.0] - 2025-07-30

### Added
- Enhanced Client and Combo Mode
- Multi-MCP-Server Client support
- Improved tool management

## [0.2.0] - 2025-07-29

### Added
- Multi-Tenant Architecture
- API Spaces concept
- Enhanced client-server communication

## [0.1.0] - 2025-07-28

### Added
- Initial project setup
- Basic MCP to REST bridge functionality
- Core server and client implementations 