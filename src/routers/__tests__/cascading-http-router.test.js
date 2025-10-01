import { logger } from "sc-common";
import { stub } from "jest-micro-auto-stub";
import CascadingBoardGenerator from "../../board/cascading-board-generator";
import TumbleCalculator from "../../board/tumble-calculator";
import { gameConfigs, definition } from "../../test-data";
import CascadingHttpRouter from "../cascading-http-router";
import defaultDefinition from "../../board/default-definition";

const prodAppConfigs = {
    sentry: {
        env: "PROD",
    },
};

const localAppConfigs = {
    sentry: {
        env: "LOCAL",
    },
};

const currencyGroupSetting = {
    groupId: "g1",
    maxWinPerRound: 1000,
};
const gameData = {
    gameConfigs,
    currencyGroupGames: [currencyGroupSetting],
    settlementResultFromAdmin: {},
};
const logService = stub(logger);
logger.logWarning = jest.fn();
logger.logError = jest.fn();

const tumbleCalculator = new TumbleCalculator();
const boardGenerator = new CascadingBoardGenerator(definition, gameData, defaultDefinition.boardSettings, logService);
boardGenerator.initialize();

const historyQuery = stub();
const metricQuery = stub();

const res = {
    send: jest.fn(),
};

function initRouter(appConfigs) {
    return new CascadingHttpRouter({ appConfigs, gameData, tumbleCalculator, boardGenerator, logService, historyQuery, metricQuery });
}

const validParams = {
    name: "Test",
    result: {
        base: {
            board: [9, 8, 8, 3, 0, 8, 8, 9, 8, 0, 0, 10, 9, 0, 8, 3, 10, 0, 0, 8, 8, 8, 8, 3, 3, 8, 0, 8, 9, 0],
            multipliers: [2, 2],
        },
        tumbles: [
            {
                newSymbols: [1, 2, 2, 1, 0, 1, 2, 2, 1, 0, 0, 10, 1, 0, 2, 0, 1, 0, 0, 1],
                multipliers: [3],
            },
        ],
    },
};

describe("handleSetBoard", () => {
    describe("PROD environment", () => {
        it("should not allow to set result and send no permission response", () => {
            //Arrange
            const router = initRouter(prodAppConfigs);

            //Act
            router.handleSetBoard({}, res);

            //Assert
            expect(res.send).toBeCalledWith({ noPermission: true });
        });
    });

    describe("non production environment", () => {
        describe("valid params", () => {
            it("should log warning to sentry", () => {
                //Arrange
                const router = initRouter(localAppConfigs);

                //Act
                router.handleSetBoard(validParams, res);

                //Assert
                expect(logService.logWarning).toBeCalled();
            });

            it("should set result to game data", () => {
                //Arrange
                const router = initRouter(localAppConfigs);

                //Act
                router.handleSetBoard(validParams, res);

                //Assert
                expect(Array.isArray(gameData.settlementResultFromAdmin[validParams.name])).toBe(true);
            });

            afterEach(() => {
                gameData.settlementResultFromAdmin = {};
            });
        });

        describe("invalid params", () => {
            const invalidParams = [null, {}, { name: "Test" }, { result: {} }];
            it.each(invalidParams)("should log to sentry", (params) => {
                //Arrange
                const router = initRouter(localAppConfigs);

                //Act
                router.handleSetBoard(params, res);

                //Assert
                expect(logService.logError).toBeCalledWith("receives a result cheating call with invalid params.");
            });

            it.each(invalidParams)("should send response with error: true", (params) => {
                //Arrange
                const router = initRouter(localAppConfigs);

                //Act
                router.handleSetBoard(params, res);

                //Assert
                expect(res.send).toBeCalledWith({ error: true });
            });
        });
    });
});

describe("generateResultFromAdmin", () => {
    it("should return pregenerated result", () => {
        //Arrange
        const router = initRouter(localAppConfigs);

        //Act
        const result = router.generateResultFromAdmin(validParams.result);

        //Assert
        expect(result.length).toEqual(2);
    });
});

describe("handleGetPlayerChainCache", () => {
    // Constants for test configuration
    const MAX_PLAYER_CHAINS = 300;
    const DEFAULT_MAX_CHAINS = 300;

    // Test data setup
    const mockPlayerChains = {
        chain1: {
            playerName: "TestPlayer1",
            playerId: "player123",
            name: "TestChain1",
            currentIndex: 5,
            totalBoards: 100,
            betLevel: 2,
            coinValue: 0.1,
            assignedAt: "2023-01-01T00:00:00Z",
            lastActivityAt: "2023-01-01T12:00:00Z",
        },
        chain2: {
            playerName: "TestPlayer2",
            playerId: "player456",
            name: "TestChain2",
            currentIndex: 10,
            totalBoards: 200,
            betLevel: 3,
            coinValue: 0.2,
            assignedAt: "2023-01-02T00:00:00Z",
            lastActivityAt: "2023-01-02T12:00:00Z",
        },
    };

    const appConfigsWithMaxChains = {
        sentry: { env: "LOCAL" },
        resultChains: { maxPlayerChains: MAX_PLAYER_CHAINS },
    };

    function setupGameDataWithPlayerChains(playerChains = {}) {
        return {
            ...gameData,
            playerChains,
        };
    }

    function initRouterWithGameData(appConfigs, gameDataOverride) {
        return new CascadingHttpRouter({
            appConfigs,
            gameData: gameDataOverride,
            tumbleCalculator,
            boardGenerator,
            logService,
            historyQuery,
            metricQuery,
        });
    }

    describe("PROD environment", () => {
        it("should send no permission response", () => {
            // Arrange
            const router = initRouter(prodAppConfigs);

            // Act
            router.handleGetPlayerChainCache(res);

            // Assert
            expect(res.send).toBeCalledWith({ noPermission: true });
        });
    });

    describe("non production environment", () => {
        describe("with player chains data", () => {
            it("should send success response", () => {
                // Arrange
                const testGameData = setupGameDataWithPlayerChains(mockPlayerChains);
                const router = initRouterWithGameData(localAppConfigs, testGameData);

                // Act
                router.handleGetPlayerChainCache(res);

                // Assert
                expect(res.send).toHaveBeenCalledWith(
                    expect.objectContaining({
                        success: true,
                    })
                );
            });

            it("should send correct chain count", () => {
                // Arrange
                const testGameData = setupGameDataWithPlayerChains(mockPlayerChains);
                const router = initRouterWithGameData(localAppConfigs, testGameData);

                // Act
                router.handleGetPlayerChainCache(res);

                // Assert
                expect(res.send).toHaveBeenCalledWith(
                    expect.objectContaining({
                        chainLoaded: 2,
                    })
                );
            });

            it("should send default max chain loaded when config not provided", () => {
                // Arrange
                const testGameData = setupGameDataWithPlayerChains(mockPlayerChains);
                const router = initRouterWithGameData(localAppConfigs, testGameData);

                // Act
                router.handleGetPlayerChainCache(res);

                // Assert
                expect(res.send).toHaveBeenCalledWith(
                    expect.objectContaining({
                        maxChainLoaded: DEFAULT_MAX_CHAINS,
                    })
                );
            });

            it("should send configured max chain loaded when config provided", () => {
                // Arrange
                const testGameData = setupGameDataWithPlayerChains(mockPlayerChains);
                const router = initRouterWithGameData(appConfigsWithMaxChains, testGameData);

                // Act
                router.handleGetPlayerChainCache(res);

                // Assert
                expect(res.send).toHaveBeenCalledWith(
                    expect.objectContaining({
                        maxChainLoaded: MAX_PLAYER_CHAINS,
                    })
                );
            });

            it("should send correctly formatted chain entries", () => {
                // Arrange
                const testGameData = setupGameDataWithPlayerChains(mockPlayerChains);
                const router = initRouterWithGameData(localAppConfigs, testGameData);
                const expectedEntries = [
                    {
                        chainKey: "chain1",
                        playerName: "TestPlayer1",
                        playerId: "player123",
                        chainName: "TestChain1",
                        currentIndex: 5,
                        totalBoards: 100,
                        betLevel: 2,
                        coinValue: 0.1,
                        assignedAt: "2023-01-01T00:00:00Z",
                        lastActivityAt: "2023-01-01T12:00:00Z",
                    },
                    {
                        chainKey: "chain2",
                        playerName: "TestPlayer2",
                        playerId: "player456",
                        chainName: "TestChain2",
                        currentIndex: 10,
                        totalBoards: 200,
                        betLevel: 3,
                        coinValue: 0.2,
                        assignedAt: "2023-01-02T00:00:00Z",
                        lastActivityAt: "2023-01-02T12:00:00Z",
                    },
                ];

                // Act
                router.handleGetPlayerChainCache(res);

                // Assert
                expect(res.send).toHaveBeenCalledWith(
                    expect.objectContaining({
                        entries: expectedEntries,
                    })
                );
            });
        });

        describe("with empty player chains", () => {
            it("should send zero chain count", () => {
                // Arrange
                const testGameData = setupGameDataWithPlayerChains({});
                const router = initRouterWithGameData(localAppConfigs, testGameData);

                // Act
                router.handleGetPlayerChainCache(res);

                // Assert
                expect(res.send).toHaveBeenCalledWith(
                    expect.objectContaining({
                        chainLoaded: 0,
                    })
                );
            });

            it("should send empty entries array", () => {
                // Arrange
                const testGameData = setupGameDataWithPlayerChains({});
                const router = initRouterWithGameData(localAppConfigs, testGameData);

                // Act
                router.handleGetPlayerChainCache(res);

                // Assert
                expect(res.send).toHaveBeenCalledWith(
                    expect.objectContaining({
                        entries: [],
                    })
                );
            });
        });

        describe("with undefined player chains", () => {
            it("should handle undefined playerChains gracefully", () => {
                // Arrange
                const testGameData = { ...gameData, playerChains: undefined };
                const router = initRouterWithGameData(localAppConfigs, testGameData);

                // Act
                router.handleGetPlayerChainCache(res);

                // Assert
                expect(res.send).toHaveBeenCalledWith(
                    expect.objectContaining({
                        chainLoaded: 0,
                        entries: [],
                    })
                );
            });
        });

        describe("error handling", () => {
            it("should log error when exception occurs", () => {
                // Arrange
                const testGameData = setupGameDataWithPlayerChains(mockPlayerChains);
                const router = initRouterWithGameData(localAppConfigs, testGameData);
                const mockError = new Error("Test error");
                jest.spyOn(Object, "entries").mockImplementationOnce(() => {
                    throw mockError;
                });

                // Act
                router.handleGetPlayerChainCache(res);

                // Assert
                expect(logService.logError).toHaveBeenCalledWith(mockError);
            });

            it("should send error response when exception occurs", () => {
                // Arrange
                const testGameData = setupGameDataWithPlayerChains(mockPlayerChains);
                const router = initRouterWithGameData(localAppConfigs, testGameData);
                jest.spyOn(Object, "entries").mockImplementationOnce(() => {
                    throw new Error("Test error");
                });

                // Act
                router.handleGetPlayerChainCache(res);

                // Assert
                expect(res.send).toHaveBeenCalledWith({ error: true });
            });
        });
    });
});

afterEach(() => {
    jest.clearAllMocks();
});
