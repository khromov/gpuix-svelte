// Node's `node:ffi` accepts these names (they are in its `types` enum) but @types/node
// leaves them out of the map the argument and return types are derived from.
declare module 'node:ffi' {
	interface DataTypeMap {
		float32: 'number';
		float64: 'number';
	}
}
