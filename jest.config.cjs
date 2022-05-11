module.exports = async () => {
    return {
        rootDir: "./",
        verbose: true,
        transform: {
            "^.+\\.js?$": "babel-jest",
        },
        transformIgnorePatterns: [
            "node_modules/(?!(sc-base-database|sc-common|sc-game-base|sc-base-apis|sc-api-client|jest-auto-fixture|sc-slot-game-base)/)",
        ],
        testEnvironment: "node",
        testResultsProcessor: "jest-sonar-reporter",
        setupFilesAfterEnv: ["jest-extended"],
    };
};
