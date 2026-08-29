module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
  ],
  coverageDirectory: './coverage',
  // Keep the initial gate intentionally low while the suite matures; this still fails
  // when coverage drops to effectively zero and gives contributors a documented minimum.
  coverageThreshold: {
    global: {
      branches: 1,
      functions: 1,
      lines: 1,
      statements: 1,
    },
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^lodash/(.*)$': '<rootDir>/node_modules/lodash/$1',
  },
};
