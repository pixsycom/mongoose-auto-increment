const toNotIgnore = {
  modules: [].join('|'),
};

const toExport = {
  testEnvironment: 'node',
  rootDir: __dirname,
  transformIgnorePatterns: ['node_modules', 'tmp'],
  moduleFileExtensions: ['js', 'json', 'jsx', 'ts', 'tsx', 'node', 'css'],
  moduleNameMapper: {},
  // setupFilesAfterEnv: ['<rootDir>/node_modules/@znemz/react-extras-jest/lib/setup.js'],
  testPathIgnorePatterns: ['/node_modules/', 'dist'],
  verbose: true,
  preset: 'ts-jest',
};

if (toNotIgnore.modules.length) {
  toExport.transformIgnorePatterns.push(`/node_modules/(?!(${toNotIgnore.modules}))`);
}

module.exports = toExport;
