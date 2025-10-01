import { stub } from "jest-micro-auto-stub";
import ChainManager from "../../board/chain-manager";
import ChainInterceptor from "../chain-interceptor";

describe("ChainInterceptor", () => {
    let chainManager;
    let logService;
    let interceptor;

    beforeEach(() => {
        chainManager = stub(ChainManager);
        const userChainConsumer = {
            assignChain: jest.fn(),
        };

        logService = {
            log: jest.fn(),
            logWarning: jest.fn(),
            logError: jest.fn(),
        };

        const definition = { configName: "cascading-slot-v1" };
        const gameData = {
            gameConfigs: {
                gameId: 1,
            },
        };

        interceptor = new ChainInterceptor({
            resultChainManager: chainManager,
            userChainConsumer,
            logService,
            definition,
            gameData,
        });

        // Store references for test assertions
        interceptor.chainManager = chainManager;
        interceptor.userChainConsumer = userChainConsumer;
    });

    describe("shouldIntercept", () => {
        it("should always return true", () => {
            const player = {
                profile: { name: "testPlayer" },
                session: {
                    playerId: "player123",
                    sessionId: "session456",
                    operatorId: "operator789",
                    gameId: 1,
                    currencyName: "USD",
                },
            };
            const bet = { totalAmount: 10 };

            const result = interceptor.shouldIntercept(player, bet);

            expect(result).toBe(true);
        });
    });

    describe("afterSuccessEvent", () => {
        const player = {
            profile: { name: "testPlayer" },
            session: {
                playerId: "player123",
                sessionId: "session456",
                operatorId: "operator789",
                gameId: 1,
                currencyName: "USD",
            },
        };
        const context = { player, bet: { totalAmount: 10, betLevel: 5, coinValue: 0.1 }, balance: { red: 100, minBet: 1, maxBet: 3000 } };

        it("should assign chain when player needs assignment", async () => {
            interceptor.userChainConsumer.assignChain.mockReturnValue(true);

            const result = await interceptor.afterSuccessEvent(context);

            expect(interceptor.userChainConsumer.assignChain).toHaveBeenCalledWith("testPlayer", {
                playerId: "player123",
                sessionId: "session456",
                operatorId: "operator789",
                gameId: 1,
                currency: "USD",
                betLevel: 5,
                coinValue: 0.1,
                balance: 100,
            });
            expect(logService.log).not.toHaveBeenCalled();
            expect(logService.logWarning).not.toHaveBeenCalled();
            expect(result).toBe(context);
        });

        it("should not assign chain when player already has one", async () => {
            interceptor.userChainConsumer.assignChain.mockReturnValue(false);

            const result = await interceptor.afterSuccessEvent(context);

            expect(interceptor.userChainConsumer.assignChain).toHaveBeenCalledWith("testPlayer", {
                playerId: "player123",
                sessionId: "session456",
                operatorId: "operator789",
                gameId: 1,
                currency: "USD",
                betLevel: 5,
                coinValue: 0.1,
                balance: 100,
            });
            expect(result).toBe(context);
        });

        it("should handle errors gracefully", async () => {
            const error = new Error("Test error");
            interceptor.userChainConsumer.assignChain.mockImplementation(() => {
                throw error;
            });

            const result = await interceptor.afterSuccessEvent(context);

            expect(logService.logError).toHaveBeenCalledWith(error);
            expect(result).toBe(context);
        });

        it("should assign chain even when bet information is missing", async () => {
            const playerWithoutSession = { profile: { name: "testPlayer" } };
            const contextWithoutBet = { player: playerWithoutSession, balance: { red: 100, minBet: 1, maxBet: 3000 } };
            interceptor.userChainConsumer.assignChain.mockReturnValue(true);

            const result = await interceptor.afterSuccessEvent(contextWithoutBet);

            expect(interceptor.userChainConsumer.assignChain).toHaveBeenCalledWith("testPlayer", {
                playerId: undefined,
                sessionId: undefined,
                operatorId: undefined,
                gameId: 1,
                currency: "",
                betLevel: undefined,
                balance: 100,
                coinValue: undefined,
            });
            expect(result).toBe(contextWithoutBet);
        });

        it("should correctly extract and pass betLevel and coinValue from bet context", async () => {
            // This test ensures we never regress on the critical betLevel/coinValue extraction
            const contextWithBetLevels = {
                player,
                bet: {
                    totalAmount: 50,
                    betLevel: 10, // ✅ Critical: Must be extracted
                    coinValue: 2.5, // ✅ Critical: Must be extracted
                    roundId: "round123",
                    betWin: 75,
                },
                balance: { red: 200, minBet: 1, maxBet: 3000 },
            };

            interceptor.userChainConsumer.assignChain.mockReturnValue(true);

            const result = await interceptor.afterSuccessEvent(contextWithBetLevels);

            expect(interceptor.userChainConsumer.assignChain).toHaveBeenCalledWith("testPlayer", {
                playerId: "player123",
                sessionId: "session456",
                operatorId: "operator789",
                gameId: 1,
                currency: "USD",
                betLevel: 10, // ✅ Must match bet.betLevel
                coinValue: 2.5, // ✅ Must match bet.coinValue
                balance: 200,
            });
            expect(result).toBe(contextWithBetLevels);
        });
    });
});
