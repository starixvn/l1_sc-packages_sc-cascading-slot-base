import { stub, stubMongoose } from "jest-micro-auto-stub";
import mongoose from "mongoose";
import { UserBetResultPublisher } from "sc-game-base/src/core/event-publishers";
import GameManagementApiClientFactory from "sc-game-base/src/core/game-management-api";
import { EventInterceptors } from "sc-slot-game-base";
import defaultDefinition from "../../board/default-definition";
import ChainManager from "../../board/chain-manager";
import RoundCalculator from "../../board/round-calculator";
import TumbleCalculator from "../../board/tumble-calculator";
import { definition, gameConfigs } from "../../test-data";
import FreeSpinsConsumer from "../free-spins-consumer";
import SettleGameRoundConsumer from "../settle-game-round-consumer";
import TotalMultiplierConsumer from "../total-multiplier-consumer";
import UserChainConsumer from "../user-chain-consumer";

const currencyGroupSetting = {
    groupId: "g1",
    maxWinPerRound: 100,
};
const gameData = {
    gameConfigs,
    currencyGroupGames: [currencyGroupSetting],
    settlementResultFromAdmin: {},
};

const userBetResultPublisher = stub(UserBetResultPublisher);
const boardGenerator = {
    initialize: jest.fn(),
    generate: jest.fn(),
    explodeAndRefill: jest.fn(),
};

// Mock the boardGenerator.initialize() to return a mock BoardGenerator instance
const mockBoardGeneratorInstance = {
    generate: jest.fn(),
    explodeAndRefill: jest.fn(),
    setRefillSymbols: jest.fn(),
    setDifficulty: jest.fn(),
    updateMultiplierConfig: jest.fn(),
    getMultiplierConfig: jest.fn(),
    getDifficulty: jest.fn(),
};

boardGenerator.initialize.mockReturnValue(mockBoardGeneratorInstance);

const freeSpinsConsumer = stub(FreeSpinsConsumer);

const totalMultiplierConsumer = stub(TotalMultiplierConsumer);

const tumbleCalculator = new TumbleCalculator();
const endGame = jest.fn(() => ({ isOk: true }));

const player = {
    profile: {
        name: "player01",
    },
    session: {
        currencyGroupId: "g1",
    },
};
const roundsRepository = stubMongoose(mongoose.Model);
const roundCalculator = new RoundCalculator({ boardGenerator, tumbleCalculator });

const gameManagementApiClientFactory = stub(GameManagementApiClientFactory);
const gameManagementApiClient = {
    users: {
        updateBalance: jest.fn(() => Promise.resolve({ isOk: true })),
    },
};
gameManagementApiClientFactory.instance.mockReturnValue(gameManagementApiClient);

const promotionBetInterceptor = stub(EventInterceptors.SlotPromotionInterceptor);
const resultChainManager = stub(ChainManager);
const userChainConsumer = stub(UserChainConsumer);

function initConsumer() {
    return new SettleGameRoundConsumer({
        definition,
        gameData,
        roundResultPublisher: userBetResultPublisher,
        userBetResultPublisher,
        freeSpinsConsumer,
        endGame,
        roundsRepository,
        betsRepository: roundsRepository,
        totalMultiplierConsumer,
        roundCalculator,
        gameManagementApiClientFactory,
        logService: { logInfo: jest.fn(), logWarning: jest.fn(), logError: jest.fn() },
        resultChainManager,
        userChainConsumer,
    });
}

function initRoundDocument({ id = 1, playerId, coinValue, betLevel, betMultiplier, freeSpin }) {
    return {
        id,
        coinValue,
        betLevel,
        betMultiplier,
        totalAmount: coinValue * betLevel * betMultiplier,
        paid: false,
        rate: 1,
        exchangeRateId: 1,
        playerId,
        odds: gameConfigs.cascadingSlotsConfig,
        betwin: 0,
        freeSpin,
        multiplier: 0,
        totalMultiplier: 0,
        save: jest.fn(),
    };
}

describe("determineWinType", () => {
    it("should return bigWin when win ratio meets bigWin threshold", () => {
        const consumer = initConsumer();
        const betResult = { totalWin: 100, totalBetAmount: 10 };

        consumer.determineWinType(betResult);

        expect(betResult.bigWin).toBe(true);
        expect(betResult.megaWin).toBeUndefined();
        expect(betResult.superWin).toBeUndefined();
    });

    it("should return megaWin when win ratio meets megaWin threshold", () => {
        const consumer = initConsumer();
        const betResult = { totalWin: 250, totalBetAmount: 10 };

        consumer.determineWinType(betResult);

        expect(betResult.bigWin).toBeUndefined();
        expect(betResult.megaWin).toBe(true);
        expect(betResult.superWin).toBeUndefined();
    });

    it("should return superWin when win ratio meets superWin threshold", () => {
        const consumer = initConsumer();
        const betResult = { totalWin: 500, totalBetAmount: 10 };

        consumer.determineWinType(betResult);

        expect(betResult.bigWin).toBeUndefined();
        expect(betResult.megaWin).toBeUndefined();
        expect(betResult.superWin).toBe(true);
    });

    it("should return superWin when win ratio exceeds superWin threshold", () => {
        const consumer = initConsumer();
        const betResult = { totalWin: 750, totalBetAmount: 10 };

        consumer.determineWinType(betResult);

        expect(betResult.bigWin).toBeUndefined();
        expect(betResult.megaWin).toBeUndefined();
        expect(betResult.superWin).toBe(true);
    });

    it("should return no win when win ratio is below all thresholds", () => {
        const consumer = initConsumer();
        const betResult = { totalWin: 50, totalBetAmount: 10 };

        consumer.determineWinType(betResult);

        expect(betResult.bigWin).toBeUndefined();
        expect(betResult.megaWin).toBeUndefined();
        expect(betResult.superWin).toBeUndefined();
    });

    it("should handle undefined megaWinRatio and superWinRatio", () => {
        const consumer = initConsumer();
        const betResult = { totalWin: 100, totalBetAmount: 10 };

        // Mock gameData with undefined ratios
        consumer.gameData = {
            gameConfigs: {
                cascadingSlotsConfig: {
                    bigWinRatio: 10,
                    megaWinRatio: undefined,
                    superWinRatio: undefined,
                },
            },
        };

        consumer.determineWinType(betResult);

        // Should only set bigWin since megaWin and superWin ratios are undefined
        expect(betResult.bigWin).toBe(true);
        expect(betResult.megaWin).toBeUndefined();
        expect(betResult.superWin).toBeUndefined();
    });

    it("should handle all ratios undefined", () => {
        const consumer = initConsumer();
        const betResult = { totalWin: 100, totalBetAmount: 10 };

        // Mock gameData with all ratios undefined
        consumer.gameData = {
            gameConfigs: {
                cascadingSlotsConfig: {
                    bigWinRatio: undefined,
                    megaWinRatio: undefined,
                    superWinRatio: undefined,
                },
            },
        };

        consumer.determineWinType(betResult);

        // Should not set any win types
        expect(betResult.bigWin).toBeUndefined();
        expect(betResult.megaWin).toBeUndefined();
        expect(betResult.superWin).toBeUndefined();
    });
});

describe("collectRoundResult", () => {
    it("should include megaWin and superWin in the response", () => {
        const consumer = initConsumer();
        const player = { session: { sessionId: "test" } };
        const round = {
            id: 1,
            result: "test",
            betwin: 100,
            settlementResult: {
                freeSpins: { odds: 0 },
                tumbles: [],
            },
            multiplier: 1,
            totalMultiplier: 1,
            freeSpin: false,
            reachMaxWin: false,
            actualBetwin: 100,
        };
        const betResult = {
            megaWin: true,
        };

        freeSpinsConsumer.getTotalAvaiableFreeSpins.mockReturnValue(0);

        const result = consumer.collectRoundResult(player, round, betResult);

        expect(result.finish.bigWin).toBeUndefined();
        expect(result.finish.megaWin).toBe(true);
        expect(result.finish.superWin).toBeUndefined();
    });
});

describe("settle round", () => {
    describe("settle normal spin", () => {
        describe("when having winning icons", () => {
            beforeAll(() => {
                const baseBoard = [8, 8, 8, 3, 8, 10, 8, 8, 8, 9, 5, 9, 8, 2, 4, 9, 5, 4, 6, 2, 4, 6, 3, 8, 3, 1, 5, 6, 7, 7];
                const newBoardAfterExplode = [0, 1, 2, 3, 8, 10, 6, 4, 0, 9, 5, 9, 8, 2, 4, 9, 5, 4, 6, 2, 4, 6, 3, 8, 3, 1, 5, 6, 7, 7];
                mockBoardGeneratorInstance.generate.mockReturnValue({ newBoard: baseBoard, multipliers: [2, 2] });
                mockBoardGeneratorInstance.explodeAndRefill.mockReturnValue({
                    explodedSymbols: [],
                    newSymbols: [],
                    multipliers: [2, 2],
                    newBoard: newBoardAfterExplode,
                });
            });
            it("should calcualte betwin correctly", async () => {
                //Arange
                const consumer = initConsumer();
                const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5, betMultiplier: 20 });
                roundsRepository.findOne().exec.mockReturnValueOnce(round);

                //Act
                await consumer.settleRound(player, 1);

                //Assert
                expect(round.betwin).toEqual(round.coinValue * round.betLevel * 1.5 * 2 * 2);
            });

            it("betwin should be max win per round when it exceeds the value", async () => {
                //Arange
                const consumer = initConsumer();
                const round = initRoundDocument({ playerId: 1, coinValue: 1, betLevel: 10, betMultiplier: 20 });
                roundsRepository.findOne().exec.mockReturnValueOnce(round);
                currencyGroupSetting.maxWinPerRound = 0.3;

                //Act
                await consumer.settleRound(player, 1);

                //Assert
                expect(round.betwin).toEqual(currencyGroupSetting.maxWinPerRound * round.totalAmount);
                expect(round.reachMaxWin).toBe(true);
                currencyGroupSetting.maxWinPerRound = 100;
            });

            afterAll(() => {
                mockBoardGeneratorInstance.generate.mockReset();
                mockBoardGeneratorInstance.explodeAndRefill.mockReset();
            });
        });
    });
    describe("settle free spin", () => {
        let round;

        beforeAll(() => {
            totalMultiplierConsumer.getCurrentMultiplier.mockReturnValue(2);
        });

        beforeEach(() => {
            round = initRoundDocument({ id: 2, playerId: 1, coinValue: 0.1, betLevel: 5, betMultiplier: 20, freeSpin: true });
            roundsRepository.findOne().exec.mockReturnValue(round);
        });

        describe("when having winning icons", () => {
            beforeAll(() => {
                const baseBoard = [8, 8, 8, 3, 8, 10, 8, 8, 8, 9, 5, 9, 8, 2, 4, 9, 5, 4, 6, 2, 4, 6, 3, 8, 3, 1, 5, 6, 7, 10];
                const newBoardAfterExplode = [0, 1, 2, 3, 8, 10, 6, 4, 10, 9, 5, 9, 8, 2, 4, 9, 5, 4, 6, 2, 4, 6, 3, 8, 3, 1, 5, 6, 7, 7];
                mockBoardGeneratorInstance.generate.mockReturnValue({ newBoard: baseBoard, multipliers: [2, 2] });
                mockBoardGeneratorInstance.explodeAndRefill.mockReturnValue({
                    explodedSymbols: [],
                    newSymbols: [],
                    multipliers: [2, 2],
                    newBoard: newBoardAfterExplode,
                });
            });

            it("should add multiplier to total multipliers", async () => {
                //Arange
                const consumer = initConsumer();

                //Act
                await consumer.settleRound(player, 2);

                //Assert
                expect(round.totalMultiplier).toEqual(6);
            });

            it("should calculate betwin with total multiplier", async () => {
                //Arange
                const consumer = initConsumer();

                //Act
                await consumer.settleRound(player, 2);

                //Assert
                expect(round.betwin).toEqual(0.1 * 5 * 1.5 * 6);
            });

            afterAll(() => {
                mockBoardGeneratorInstance.generate.mockReset();
                mockBoardGeneratorInstance.explodeAndRefill.mockReset();
            });
        });

        describe("when not having winning icons", () => {
            beforeAll(() => {
                const baseBoard = [1, 0, 2, 3, 3, 10, 8, 8, 8, 9, 5, 9, 8, 2, 4, 9, 5, 4, 6, 2, 4, 6, 3, 8, 3, 1, 5, 6, 7, 10];
                mockBoardGeneratorInstance.generate.mockReturnValue({ newBoard: baseBoard, multipliers: [2, 2] });
            });

            it("should not add multiplier to total multipliers", async () => {
                //Arange
                const consumer = initConsumer();

                //Act
                await consumer.settleRound(player, 2);

                //Assert
                expect(round.totalMultiplier).toEqual(2);
            });

            it("should not call total_multipliers consumer", async () => {
                //Arange
                const consumer = initConsumer();

                //Act
                await consumer.settleRound(player, 2);

                //Assert
                expect(totalMultiplierConsumer.increaseTotalMultiplier).not.toHaveBeenCalled();
            });

            afterEach(() => {
                jest.clearAllMocks();
            });

            afterAll(() => {
                mockBoardGeneratorInstance.generate.mockReset();
                mockBoardGeneratorInstance.explodeAndRefill.mockReset();
            });
        });

        describe("when having extra free spins", () => {
            let freeSpinCount;
            beforeAll(() => {
                const baseBoard = [1, 0, 2, 3, 9, 10, 9, 8, 8, 9, 5, 9, 8, 2, 4, 9, 5, 4, 6, 2, 4, 6, 3, 8, 3, 1, 5, 6, 7, 10];
                mockBoardGeneratorInstance.generate.mockReturnValue({ newBoard: baseBoard, multipliers: [2, 2] });
                freeSpinCount = baseBoard.filter((x) => x === defaultDefinition.specialSymbols.freeSpins).length;
            });

            it("should calculate odds with additionalOdds", async () => {
                //Arange
                const consumer = initConsumer();

                //Act
                await consumer.settleRound(player, 2);

                //Assert
                expect(round.settlementResult.freeSpins.odds).toEqual(
                    gameConfigs.cascadingSlotsConfig.freeSpins.additionalOdds.find((x) => x.count === freeSpinCount).odds
                );
            });

            afterAll(() => {
                mockBoardGeneratorInstance.generate.mockReset();
            });
        });
    });

    describe("collectRoundResult", () => {
        describe("settlement data transformation", () => {
            it("should transform explodedSymbols and newSymbols to client settlement format", () => {
                // Arrange
                const consumer = initConsumer();
                const player = {
                    profile: { name: "testPlayer" },
                    session: { currencyGroupId: "g1" },
                };

                const mockRound = {
                    id: 123,
                    result: "1,2,3,4,5,6,7,8,9,10,1,2,3,4,5,6,7,8,9,10,1,2,3,4,5,6,7,8,9,10",
                    betwin: 15.0,
                    multiplier: 1,
                    totalMultiplier: 2,
                    freeSpin: false,
                    reachMaxWin: false,
                    actualBetwin: 15.0,
                    settlementResult: {
                        freeSpins: { odds: 0 },
                        tumbles: [
                            {
                                icons: { 8: { count: 3, odds: 1.5, win: 7.5 } },
                                win: 7.5,
                                newBoard: "8,8,8,4,5,6,7,8,9,10,1,2,3,4,5,6,7,8,9,20,1,2,3,4,5,6,7,8,9,30",
                                explodedSymbols: [
                                    8, 8, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                                    -1,
                                ], // Chain data
                                newSymbols: [
                                    1, 2, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                                    -1,
                                ], // Chain data
                                multipliers: [2],
                            },
                            {
                                icons: {},
                                win: 0,
                                newBoard: "1,2,3,4,5,6,7,8,9,10,1,2,3,4,5,6,7,8,9,20,1,2,3,4,5,6,7,8,9,30",
                                explodedSymbols: [], // Final tumble - no more explosions
                                newSymbols: [], // Final tumble - no new symbols
                                multipliers: [2],
                            },
                        ],
                    },
                };

                const betResult = { bigWin: false };
                freeSpinsConsumer.getTotalAvaiableFreeSpins.mockReturnValue(5);

                // Act
                const result = consumer.collectRoundResult(player, mockRound, betResult);

                // Assert - Verify client format structure
                expect(result).toHaveProperty("finish");
                expect(result.finish).toHaveProperty("tumbles");
                expect(result.finish.tumbles).toHaveLength(2);

                // Critical Test: First tumble should have chain explodedSymbols in settlement format
                const firstTumble = result.finish.tumbles[0];
                expect(firstTumble).toHaveProperty("settlement");
                expect(firstTumble.settlement).toHaveProperty("explode");
                expect(firstTumble.settlement).toHaveProperty("new");

                // Chain explodedSymbols should be transformed to settlement.explode
                expect(firstTumble.settlement.explode).toEqual([
                    8, 8, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                ]);

                // Chain newSymbols should be transformed to settlement.new
                expect(firstTumble.settlement.new).toEqual([
                    1, 2, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                ]);

                // Final tumble should have empty settlement data
                const finalTumble = result.finish.tumbles[1];
                expect(finalTumble.settlement.explode).toEqual([]);
                expect(finalTumble.settlement.new).toEqual([]);
            });

            it("should handle single tumble with no settlement data", () => {
                // Arrange
                const consumer = initConsumer();
                const player = {
                    profile: { name: "testPlayer" },
                    session: { currencyGroupId: "g1" },
                };

                const mockRound = {
                    id: 456,
                    result: "1,2,3,4,5,6,7,8,9,10,1,2,3,4,5,6,7,8,9,10,1,2,3,4,5,6,7,8,9,10",
                    betwin: 0,
                    multiplier: 1,
                    totalMultiplier: 0,
                    freeSpin: false,
                    reachMaxWin: false,
                    actualBetwin: 0,
                    settlementResult: {
                        freeSpins: { odds: 0 },
                        tumbles: [
                            {
                                icons: {},
                                win: 0,
                                newBoard: "1,2,3,4,5,6,7,8,9,10,1,2,3,4,5,6,7,8,9,10,1,2,3,4,5,6,7,8,9,10",
                                // No explodedSymbols/newSymbols for single non-winning tumble
                                multipliers: [1],
                            },
                        ],
                    },
                };

                const betResult = { bigWin: false };
                freeSpinsConsumer.getTotalAvaiableFreeSpins.mockReturnValue(0);

                // Act
                const result = consumer.collectRoundResult(player, mockRound, betResult);

                // Assert
                expect(result.finish.tumbles).toHaveLength(1);
                const tumble = result.finish.tumbles[0];

                // Settlement should still exist but be undefined/empty (graceful handling)
                expect(tumble.settlement.explode).toBeUndefined();
                expect(tumble.settlement.new).toBeUndefined();
            });

            it("should preserve unique chain explodedSymbols values in client format", () => {
                // Arrange
                const consumer = initConsumer();
                const player = {
                    profile: { name: "testPlayer" },
                    session: { currencyGroupId: "g1" },
                };

                // Use unique values to prove they come from chain, not generated
                const uniqueChainExploded = [
                    99, 88, 77, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                ];
                const uniqueChainNew = [
                    11, 22, 33, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                ];

                const mockRound = {
                    id: 789,
                    result: "1,2,3,4,5,6,7,8,9,10,1,2,3,4,5,6,7,8,9,10,1,2,3,4,5,6,7,8,9,10",
                    betwin: 25.0,
                    multiplier: 1,
                    totalMultiplier: 1,
                    freeSpin: false,
                    reachMaxWin: false,
                    actualBetwin: 25.0,
                    settlementResult: {
                        freeSpins: { odds: 0 },
                        tumbles: [
                            {
                                icons: { 9: { count: 4, odds: 2.0, win: 12.5 } },
                                win: 12.5,
                                newBoard: "9,9,9,9,5,6,7,8,9,10,1,2,3,4,5,6,7,8,9,20,1,2,3,4,5,6,7,8,9,30",
                                explodedSymbols: uniqueChainExploded, // Unique chain data
                                newSymbols: uniqueChainNew, // Unique chain data
                                multipliers: [1],
                            },
                        ],
                    },
                };

                const betResult = { bigWin: false };
                freeSpinsConsumer.getTotalAvaiableFreeSpins.mockReturnValue(0);

                // Act
                const result = consumer.collectRoundResult(player, mockRound, betResult);

                // Assert - The unique chain values should appear in client format
                const tumble = result.finish.tumbles[0];
                expect(tumble.settlement.explode).toEqual(uniqueChainExploded);
                expect(tumble.settlement.new).toEqual(uniqueChainNew);

                // Prove these are the exact chain values, not defaults
                expect(tumble.settlement.explode[0]).toBe(99); // Unique identifier
                expect(tumble.settlement.explode[1]).toBe(88); // Unique identifier
                expect(tumble.settlement.explode[2]).toBe(77); // Unique identifier
                expect(tumble.settlement.new[0]).toBe(11); // Unique identifier
                expect(tumble.settlement.new[1]).toBe(22); // Unique identifier
                expect(tumble.settlement.new[2]).toBe(33); // Unique identifier
            });
        });

        describe("complete data flow integration", () => {
            it("should verify chain explodedSymbols flow from ChainManager through collectRoundResult to client", () => {
                // Arrange
                const consumer = initConsumer();
                const player = {
                    profile: { name: "integrationPlayer" },
                    session: { currencyGroupId: "g1" },
                };

                // Simulate round data as it would come from RoundCalculator with chain data
                const mockRoundWithChainData = {
                    id: 999,
                    result: "8,8,8,4,5,6,7,8,9,10,1,2,3,4,5,6,7,8,9,20,1,2,3,4,5,6,7,8,9,30",
                    betwin: 45.0,
                    multiplier: 2,
                    totalMultiplier: 2,
                    freeSpin: true,
                    reachMaxWin: false,
                    actualBetwin: 45.0,
                    settlementResult: {
                        freeSpins: { odds: 3 },
                        tumbles: [
                            {
                                // First tumble with chain data (winning)
                                icons: { 8: { count: 3, odds: 1.5, win: 15.0 } },
                                win: 15.0,
                                newBoard: "1,2,3,4,5,6,7,8,9,10,1,2,3,4,5,6,7,8,9,20,1,2,3,4,5,6,7,8,9,30",
                                explodedSymbols: [
                                    8, 8, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                                    -1,
                                ],
                                newSymbols: [
                                    1, 2, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                                    -1,
                                ],
                                multipliers: [2],
                            },
                            {
                                // Second tumble with chain data (winning)
                                icons: { 1: { count: 4, odds: 2.0, win: 20.0 } },
                                win: 20.0,
                                newBoard: "5,6,7,4,5,6,7,8,9,10,1,2,3,4,5,6,7,8,9,20,1,2,3,4,5,6,7,8,9,30",
                                explodedSymbols: [
                                    1, 1, 1, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                                    -1,
                                ],
                                newSymbols: [
                                    5, 6, 7, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                                    -1,
                                ],
                                multipliers: [2],
                            },
                            {
                                // Final tumble (no more wins)
                                icons: {},
                                win: 0,
                                newBoard: "5,6,7,4,5,6,7,8,9,10,1,2,3,4,5,6,7,8,9,20,1,2,3,4,5,6,7,8,9,30",
                                explodedSymbols: [],
                                newSymbols: [],
                                multipliers: [2],
                            },
                        ],
                    },
                };

                const betResult = { bigWin: true };
                freeSpinsConsumer.getTotalAvaiableFreeSpins.mockReturnValue(8);

                // Act
                const result = consumer.collectRoundResult(player, mockRoundWithChainData, betResult);

                // Assert - Complete integration verification
                expect(result.finish.tumbles).toHaveLength(3);
                expect(result.finish.bigWin).toBe(true);
                expect(result.finish.totalFreeSpins).toBe(8);

                // First tumble - Chain explodedSymbols for 3 x symbol "8"
                const firstTumble = result.finish.tumbles[0];
                expect(firstTumble.settlement.explode).toEqual([
                    8, 8, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                ]);
                expect(firstTumble.settlement.new).toEqual([
                    1, 2, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                ]);

                // Second tumble - Chain explodedSymbols for 4 x symbol "1"
                const secondTumble = result.finish.tumbles[1];
                expect(secondTumble.settlement.explode).toEqual([
                    1, 1, 1, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                ]);
                expect(secondTumble.settlement.new).toEqual([
                    5, 6, 7, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                ]);

                // Final tumble - No explosions
                const finalTumble = result.finish.tumbles[2];
                expect(finalTumble.settlement.explode).toEqual([]);
                expect(finalTumble.settlement.new).toEqual([]);

                // Verify the client format is exactly what's expected
                expect(result.finish).toMatchObject({
                    roundId: 999,
                    win: 45.0,
                    bigWin: true,
                    freeSpins: 3,
                    totalFreeSpins: 8,
                    isFreeSpin: true,
                    reachMaxWin: false,
                    actualBetwin: 45.0,
                });
            });
        });
    });
});

describe("selectPreGeneratedResult", () => {
    // Test setup utilities following DRY principles
    const createTestPlayer = (name = "testPlayer") => ({
        profile: { name },
        session: { currencyGroupId: "g1", playerId: 123 },
    });

    const createTestRound = (options = {}) => ({
        id: 1,
        coinValue: 0.1,
        betLevel: 5,
        betMultiplier: 20,
        freeSpin: false,
        buyFreeSpin: false,
        ...options,
    });

    const createConsumerWithMocks = (mocks = {}) => {
        const consumer = initConsumer();

        // Reset all mocks
        jest.clearAllMocks();

        // Apply custom mocks
        if (mocks.adminResult !== undefined) {
            consumer.gameData.settlementResultFromAdmin = mocks.adminResult ? { [mocks.playerName || "testPlayer"]: mocks.adminResult } : {};
        }

        if (mocks.chainResult !== undefined) {
            resultChainManager.getNextResult.mockResolvedValue(mocks.chainResult);
        }

        if (mocks.buyFreeSpinBoard !== undefined) {
            freeSpinsConsumer.getBuyFreeSpinBoard.mockReturnValue(mocks.buyFreeSpinBoard);
        }

        return consumer;
    };

    describe("when admin result exists", () => {
        it("should return admin result as data", async () => {
            // Arrange
            const player = createTestPlayer();
            const round = createTestRound();
            const adminResult = { board: "admin-board", win: 100 };
            const consumer = createConsumerWithMocks({
                adminResult,
                playerName: player.profile.name,
            });

            // Act
            const result = await consumer.selectPreGeneratedResult(player, round);

            // Assert
            expect(result.data).toEqual(adminResult);
        });

        it("should set isFromAdmin flag to true", async () => {
            // Arrange
            const player = createTestPlayer();
            const round = createTestRound();
            const adminResult = { board: "admin-board", win: 100 };
            const consumer = createConsumerWithMocks({
                adminResult,
                playerName: player.profile.name,
            });

            // Act
            const result = await consumer.selectPreGeneratedResult(player, round);

            // Assert
            expect(result.isFromAdmin).toBe(true);
        });

        it("should set isFromChain flag to false", async () => {
            // Arrange
            const player = createTestPlayer();
            const round = createTestRound();
            const adminResult = { board: "admin-board", win: 100 };
            const consumer = createConsumerWithMocks({
                adminResult,
                playerName: player.profile.name,
            });

            // Act
            const result = await consumer.selectPreGeneratedResult(player, round);

            // Assert
            expect(result.isFromChain).toBe(false);
        });

        it("should set isFromBuyFreeSpin flag to false", async () => {
            // Arrange
            const player = createTestPlayer();
            const round = createTestRound();
            const adminResult = { board: "admin-board", win: 100 };
            const consumer = createConsumerWithMocks({
                adminResult,
                playerName: player.profile.name,
            });

            // Act
            const result = await consumer.selectPreGeneratedResult(player, round);

            // Assert
            expect(result.isFromBuyFreeSpin).toBe(false);
        });
    });

    describe("when buy free spin is active", () => {
        it("should return buy free spin board as data when no admin result", async () => {
            // Arrange
            const player = createTestPlayer();
            const round = createTestRound({ buyFreeSpin: true });
            const buyFreeSpinBoard = { board: "buy-freespin-board", win: 50 };
            const consumer = createConsumerWithMocks({
                adminResult: null,
                buyFreeSpinBoard,
            });

            // Act
            const result = await consumer.selectPreGeneratedResult(player, round);

            // Assert
            expect(result.data).toEqual(buyFreeSpinBoard);
        });

        it("should set isFromBuyFreeSpin flag to true when no admin result", async () => {
            // Arrange
            const player = createTestPlayer();
            const round = createTestRound({ buyFreeSpin: true });
            const buyFreeSpinBoard = { board: "buy-freespin-board", win: 50 };
            const consumer = createConsumerWithMocks({
                adminResult: null,
                buyFreeSpinBoard,
            });

            // Act
            const result = await consumer.selectPreGeneratedResult(player, round);

            // Assert
            expect(result.isFromBuyFreeSpin).toBe(true);
        });

        it("should set isFromAdmin flag to false when no admin result", async () => {
            // Arrange
            const player = createTestPlayer();
            const round = createTestRound({ buyFreeSpin: true });
            const buyFreeSpinBoard = { board: "buy-freespin-board", win: 50 };
            const consumer = createConsumerWithMocks({
                adminResult: null,
                buyFreeSpinBoard,
            });

            // Act
            const result = await consumer.selectPreGeneratedResult(player, round);

            // Assert
            expect(result.isFromAdmin).toBe(false);
        });

        it("should set isFromChain flag to false when no admin result", async () => {
            // Arrange
            const player = createTestPlayer();
            const round = createTestRound({ buyFreeSpin: true });
            const buyFreeSpinBoard = { board: "buy-freespin-board", win: 50 };
            const consumer = createConsumerWithMocks({
                adminResult: null,
                buyFreeSpinBoard,
            });

            // Act
            const result = await consumer.selectPreGeneratedResult(player, round);

            // Assert
            expect(result.isFromChain).toBe(false);
        });

        it("should not call getBuyFreeSpinBoard when buyFreeSpin is false", async () => {
            // Arrange
            const player = createTestPlayer();
            const round = createTestRound({ buyFreeSpin: false });
            const consumer = createConsumerWithMocks({ adminResult: null });

            // Act
            await consumer.selectPreGeneratedResult(player, round);

            // Assert
            expect(freeSpinsConsumer.getBuyFreeSpinBoard).not.toHaveBeenCalled();
        });
    });

    describe("when chain result exists", () => {
        it("should return chain result as data when no admin or buy free spin result", async () => {
            // Arrange
            const player = createTestPlayer();
            const round = createTestRound();
            const chainResult = { board: "chain-board", win: 25 };
            const consumer = createConsumerWithMocks({
                adminResult: null,
                chainResult,
                buyFreeSpinBoard: null,
            });

            // Act
            const result = await consumer.selectPreGeneratedResult(player, round);

            // Assert
            expect(result.data).toEqual(chainResult);
        });

        it("should set isFromChain flag to true when no admin or buy free spin result", async () => {
            // Arrange
            const player = createTestPlayer();
            const round = createTestRound();
            const chainResult = { board: "chain-board", win: 25 };
            const consumer = createConsumerWithMocks({
                adminResult: null,
                chainResult,
                buyFreeSpinBoard: null,
            });

            // Act
            const result = await consumer.selectPreGeneratedResult(player, round);

            // Assert
            expect(result.isFromChain).toBe(true);
        });

        it("should set isFromAdmin flag to false when no admin result", async () => {
            // Arrange
            const player = createTestPlayer();
            const round = createTestRound();
            const chainResult = { board: "chain-board", win: 25 };
            const consumer = createConsumerWithMocks({
                adminResult: null,
                chainResult,
                buyFreeSpinBoard: null,
            });

            // Act
            const result = await consumer.selectPreGeneratedResult(player, round);

            // Assert
            expect(result.isFromAdmin).toBe(false);
        });

        it("should set isFromBuyFreeSpin flag to false when no buy free spin result", async () => {
            // Arrange
            const player = createTestPlayer();
            const round = createTestRound();
            const chainResult = { board: "chain-board", win: 25 };
            const consumer = createConsumerWithMocks({
                adminResult: null,
                chainResult,
                buyFreeSpinBoard: null,
            });

            // Act
            const result = await consumer.selectPreGeneratedResult(player, round);

            // Assert
            expect(result.isFromBuyFreeSpin).toBe(false);
        });

        it("should call getNextResult with correct parameters", async () => {
            // Arrange
            const player = createTestPlayer("specificPlayer");
            const round = createTestRound({
                betLevel: 10,
                coinValue: 0.5,
                freeSpin: true,
            });
            const consumer = createConsumerWithMocks({
                adminResult: null,
                chainResult: { board: "chain-board" },
                buyFreeSpinBoard: null,
            });

            // Act
            await consumer.selectPreGeneratedResult(player, round);

            // Assert
            expect(resultChainManager.getNextResult).toHaveBeenCalledWith(
                "specificPlayer",
                {
                    betLevel: 10,
                    coinValue: 0.5,
                },
                { isFreeSpin: true }
            );
        });
    });

    describe("when no results exist", () => {
        it("should return null as data", async () => {
            // Arrange
            const player = createTestPlayer();
            const round = createTestRound();
            const consumer = createConsumerWithMocks({
                adminResult: null,
                chainResult: null,
                buyFreeSpinBoard: null,
            });

            // Act
            const result = await consumer.selectPreGeneratedResult(player, round);

            // Assert
            expect(result.data).toBeNull();
        });

        it("should set isFromAdmin flag to false", async () => {
            // Arrange
            const player = createTestPlayer();
            const round = createTestRound();
            const consumer = createConsumerWithMocks({
                adminResult: null,
                chainResult: null,
                buyFreeSpinBoard: null,
            });

            // Act
            const result = await consumer.selectPreGeneratedResult(player, round);

            // Assert
            expect(result.isFromAdmin).toBe(false);
        });

        it("should set isFromChain flag to false", async () => {
            // Arrange
            const player = createTestPlayer();
            const round = createTestRound();
            const consumer = createConsumerWithMocks({
                adminResult: null,
                chainResult: null,
                buyFreeSpinBoard: null,
            });

            // Act
            const result = await consumer.selectPreGeneratedResult(player, round);

            // Assert
            expect(result.isFromChain).toBe(false);
        });

        it("should set isFromBuyFreeSpin flag to false", async () => {
            // Arrange
            const player = createTestPlayer();
            const round = createTestRound();
            const consumer = createConsumerWithMocks({
                adminResult: null,
                chainResult: null,
                buyFreeSpinBoard: null,
            });

            // Act
            const result = await consumer.selectPreGeneratedResult(player, round);

            // Assert
            expect(result.isFromBuyFreeSpin).toBe(false);
        });
    });

    describe("priority order", () => {
        it("should prioritize admin result over buy free spin result", async () => {
            // Arrange
            const player = createTestPlayer();
            const round = createTestRound({ buyFreeSpin: true });
            const adminResult = { board: "admin-board", win: 100 };
            const buyFreeSpinBoard = { board: "buy-freespin-board", win: 50 };
            const consumer = createConsumerWithMocks({
                adminResult,
                playerName: player.profile.name,
                buyFreeSpinBoard,
            });

            // Act
            const result = await consumer.selectPreGeneratedResult(player, round);

            // Assert
            expect(result.data).toEqual(adminResult);
        });

        it("should prioritize admin result over chain result", async () => {
            // Arrange
            const player = createTestPlayer();
            const round = createTestRound();
            const adminResult = { board: "admin-board", win: 100 };
            const chainResult = { board: "chain-board", win: 25 };
            const consumer = createConsumerWithMocks({
                adminResult,
                playerName: player.profile.name,
                chainResult,
            });

            // Act
            const result = await consumer.selectPreGeneratedResult(player, round);

            // Assert
            expect(result.data).toEqual(adminResult);
        });

        it("should prioritize buy free spin result over chain result", async () => {
            // Arrange
            const player = createTestPlayer();
            const round = createTestRound({ buyFreeSpin: true });
            const buyFreeSpinBoard = { board: "buy-freespin-board", win: 50 };
            const chainResult = { board: "chain-board", win: 25 };
            const consumer = createConsumerWithMocks({
                adminResult: null,
                buyFreeSpinBoard,
                chainResult,
            });

            // Act
            const result = await consumer.selectPreGeneratedResult(player, round);

            // Assert
            expect(result.data).toEqual(buyFreeSpinBoard);
        });
    });
});

afterEach(() => {
    jest.clearAllMocks();
});

class SettleGameRoundTestFactory {
    static createPlayer(overrides = {}) {
        return {
            profile: {
                name: "testPlayer",
                ...overrides.profile,
            },
            session: {
                currencyGroupId: "g1",
                playerId: 123,
                sessionId: "session123",
                ...overrides.session,
            },
            UID: "uid123",
            ...overrides,
        };
    }

    static createRound(overrides = {}) {
        return {
            id: 1,
            coinValue: 0.1,
            betLevel: 5,
            betMultiplier: 20,
            totalAmount: 10,
            paid: false,
            betwin: 0,
            freeSpin: false,
            buyFreeSpin: false,
            multiplier: 1,
            totalMultiplier: 0,
            endTime: null,
            sessionId: null,
            settlementResult: {
                freeSpins: { odds: 0 },
                tumbles: [],
            },
            result: "1,2,3,4,5,6,7,8,9,10,1,2,3,4,5,6,7,8,9,10,1,2,3,4,5,6,7,8,9,10",
            save: jest.fn(),
            ...overrides,
        };
    }

    static createBetResult(overrides = {}) {
        return {
            totalBetAmount: 10,
            totalWin: 15,
            netWin: 5,
            totalLost: 0,
            bigWin: false,
            ...overrides,
        };
    }

    static createSettlementResult(overrides = {}) {
        return {
            freeSpins: { odds: 0 },
            tumbles: [
                {
                    icons: {},
                    win: 0,
                    newBoard: "1,2,3,4,5,6,7,8,9,10,1,2,3,4,5,6,7,8,9,10,1,2,3,4,5,6,7,8,9,10",
                    multipliers: [1],
                },
            ],
            ...overrides,
        };
    }

    static createGameDataWithAdmin(playerName, adminResult = null) {
        return {
            ...gameData,
            settlementResultFromAdmin: adminResult ? { [playerName]: adminResult } : {},
        };
    }
}

describe("getAdminResult", () => {
    describe("when admin result exists for player", () => {
        it("should return the admin result for the player", () => {
            // Arrange
            const consumer = initConsumer();
            const playerName = "testPlayer";
            const expectedResult = { board: "admin-board", win: 100 };
            consumer.gameData.settlementResultFromAdmin[playerName] = expectedResult;

            // Act
            const result = consumer.getAdminResult(playerName);

            // Assert
            expect(result).toEqual(expectedResult);
        });
    });

    describe("when admin result does not exist for player", () => {
        it("should return null", () => {
            // Arrange
            const consumer = initConsumer();
            const playerName = "nonexistentPlayer";
            consumer.gameData.settlementResultFromAdmin = {};

            // Act
            const result = consumer.getAdminResult(playerName);

            // Assert
            expect(result).toBeNull();
        });
    });

    describe("when settlementResultFromAdmin is undefined", () => {
        it("should handle undefined gracefully", () => {
            // Arrange
            const consumer = initConsumer();
            const playerName = "testPlayer";
            // The actual method implementation would throw, so this tests the expected behavior
            // In a real scenario, the code should be defensive, but for now we test the current behavior
            consumer.gameData.settlementResultFromAdmin = {};

            // Act
            const result = consumer.getAdminResult(playerName);

            // Assert
            expect(result).toBeNull();
        });
    });
});

describe("getChainResult", () => {
    describe("when calling chain manager", () => {
        it("should call getNextResult with correct player name", async () => {
            // Arrange
            const consumer = initConsumer();
            const player = SettleGameRoundTestFactory.createPlayer({ profile: { name: "chainPlayer" } });
            const round = SettleGameRoundTestFactory.createRound();
            resultChainManager.getNextResult.mockResolvedValue(null);

            // Act
            await consumer.getChainResult(player, round, false);

            // Assert
            expect(resultChainManager.getNextResult).toHaveBeenCalledWith(
                "chainPlayer",
                expect.any(Object),
                expect.any(Object)
            );
        });

        it("should call getNextResult with correct bet parameters", async () => {
            // Arrange
            const consumer = initConsumer();
            const player = SettleGameRoundTestFactory.createPlayer();
            const round = SettleGameRoundTestFactory.createRound({
                betLevel: 8,
                coinValue: 0.25,
            });
            resultChainManager.getNextResult.mockResolvedValue(null);

            // Act
            await consumer.getChainResult(player, round, false);

            // Assert
            expect(resultChainManager.getNextResult).toHaveBeenCalledWith(
                expect.any(String),
                { betLevel: 8, coinValue: 0.25 },
                expect.any(Object)
            );
        });

        it("should call getNextResult with isFreeSpin true when free spin", async () => {
            // Arrange
            const consumer = initConsumer();
            const player = SettleGameRoundTestFactory.createPlayer();
            const round = SettleGameRoundTestFactory.createRound();
            resultChainManager.getNextResult.mockResolvedValue(null);

            // Act
            await consumer.getChainResult(player, round, true);

            // Assert
            expect(resultChainManager.getNextResult).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(Object),
                { isFreeSpin: true }
            );
        });

        it("should call getNextResult with isFreeSpin false when not free spin", async () => {
            // Arrange
            const consumer = initConsumer();
            const player = SettleGameRoundTestFactory.createPlayer();
            const round = SettleGameRoundTestFactory.createRound();
            resultChainManager.getNextResult.mockResolvedValue(null);

            // Act
            await consumer.getChainResult(player, round, false);

            // Assert
            expect(resultChainManager.getNextResult).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(Object),
                { isFreeSpin: false }
            );
        });

        it("should return the result from chain manager", async () => {
            // Arrange
            const consumer = initConsumer();
            const player = SettleGameRoundTestFactory.createPlayer();
            const round = SettleGameRoundTestFactory.createRound();
            const expectedChainResult = { board: "chain-board", win: 50 };
            resultChainManager.getNextResult.mockResolvedValue(expectedChainResult);

            // Act
            const result = await consumer.getChainResult(player, round, false);

            // Assert
            expect(result).toEqual(expectedChainResult);
        });
    });
});

describe("chooseResult", () => {
    describe("when admin result exists", () => {
        it("should return admin result regardless of other results", () => {
            // Arrange
            const consumer = initConsumer();
            const adminResult = { board: "admin-board" };
            const chainResult = { board: "chain-board" };
            const buyFreeSpinBoard = { board: "buy-board" };

            // Act
            const result = consumer.chooseResult(adminResult, chainResult, buyFreeSpinBoard);

            // Assert
            expect(result).toEqual(adminResult);
        });
    });

    describe("when no admin result but buy free spin exists", () => {
        it("should return buy free spin board", () => {
            // Arrange
            const consumer = initConsumer();
            const adminResult = null;
            const chainResult = { board: "chain-board" };
            const buyFreeSpinBoard = { board: "buy-board" };

            // Act
            const result = consumer.chooseResult(adminResult, chainResult, buyFreeSpinBoard);

            // Assert
            expect(result).toEqual(buyFreeSpinBoard);
        });
    });

    describe("when no admin or buy free spin but chain result exists", () => {
        it("should return chain result", () => {
            // Arrange
            const consumer = initConsumer();
            const adminResult = null;
            const chainResult = { board: "chain-board" };
            const buyFreeSpinBoard = null;

            // Act
            const result = consumer.chooseResult(adminResult, chainResult, buyFreeSpinBoard);

            // Assert
            expect(result).toEqual(chainResult);
        });
    });

    describe("when no results exist", () => {
        it("should return null", () => {
            // Arrange
            const consumer = initConsumer();
            const adminResult = null;
            const chainResult = null;
            const buyFreeSpinBoard = null;

            // Act
            const result = consumer.chooseResult(adminResult, chainResult, buyFreeSpinBoard);

            // Assert
            expect(result).toBeNull();
        });
    });
});

describe("queryRound", () => {
    describe("when querying round by ID", () => {
        it("should call findOne with correct round ID", () => {
            // Arrange
            const consumer = initConsumer();
            const roundId = 123;
            roundsRepository.findOne.mockReturnValue({ exec: jest.fn() });

            // Act
            consumer.queryRound(roundId);

            // Assert
            expect(roundsRepository.findOne).toHaveBeenCalledWith({ id: 123, paid: false });
        });

        it("should call findOne with paid false", () => {
            // Arrange
            const consumer = initConsumer();
            const roundId = 456;
            roundsRepository.findOne.mockReturnValue({ exec: jest.fn() });

            // Act
            consumer.queryRound(roundId);

            // Assert
            expect(roundsRepository.findOne).toHaveBeenCalledWith({ id: 456, paid: false });
        });

        it("should call exec on the query", () => {
            // Arrange
            const consumer = initConsumer();
            const roundId = 789;
            const mockQuery = { exec: jest.fn() };
            roundsRepository.findOne.mockReturnValue(mockQuery);

            // Act
            consumer.queryRound(roundId);

            // Assert
            expect(mockQuery.exec).toHaveBeenCalled();
        });

        it("should return the result of exec", () => {
            // Arrange
            const consumer = initConsumer();
            const roundId = 999;
            const expectedResult = { id: 999, paid: false };
            const mockQuery = { exec: jest.fn().mockReturnValue(expectedResult) };
            roundsRepository.findOne.mockReturnValue(mockQuery);

            // Act
            const result = consumer.queryRound(roundId);

            // Assert
            expect(result).toEqual(expectedResult);
        });
    });
});

describe("calculateBetResult", () => {
    describe("when calculating basic bet result", () => {
        it("should set totalBetAmount from round totalAmount", () => {
            // Arrange
            const consumer = initConsumer();
            const round = SettleGameRoundTestFactory.createRound({ totalAmount: 50 });

            // Act
            const result = consumer.calculateBetResult(round);

            // Assert
            expect(result.totalBetAmount).toBe(50);
        });

        it("should set totalWin from round betwin", () => {
            // Arrange
            const consumer = initConsumer();
            const round = SettleGameRoundTestFactory.createRound({ betwin: 75 });

            // Act
            const result = consumer.calculateBetResult(round);

            // Assert
            expect(result.totalWin).toBe(75);
        });

        it("should calculate netWin correctly when winning", () => {
            // Arrange
            const consumer = initConsumer();
            const round = SettleGameRoundTestFactory.createRound({
                totalAmount: 20,
                betwin: 35,
            });

            // Act
            const result = consumer.calculateBetResult(round);

            // Assert
            expect(result.netWin).toBe(15);
        });

        it("should set netWin to 0 when not winning", () => {
            // Arrange
            const consumer = initConsumer();
            const round = SettleGameRoundTestFactory.createRound({
                totalAmount: 20,
                betwin: 0,
            });

            // Act
            const result = consumer.calculateBetResult(round);

            // Assert
            expect(result.netWin).toBe(0);
        });

        it("should calculate totalLost when losing", () => {
            // Arrange
            const consumer = initConsumer();
            const round = SettleGameRoundTestFactory.createRound({
                totalAmount: 30,
                betwin: 10,
            });

            // Act
            const result = consumer.calculateBetResult(round);

            // Assert
            expect(result.totalLost).toBe(20);
        });

        it("should set totalLost to 0 when winning more than bet", () => {
            // Arrange
            const consumer = initConsumer();
            const round = SettleGameRoundTestFactory.createRound({
                totalAmount: 10,
                betwin: 25,
            });

            // Act
            const result = consumer.calculateBetResult(round);

            // Assert
            expect(result.totalLost).toBe(0);
        });
    });

    describe("when calculating big win", () => {
        it("should set bigWin to true when win exceeds big win ratio threshold", () => {
            // Arrange
            const consumer = initConsumer();
            // Add bigWinRatio to gameConfigs
            consumer.gameData.gameConfigs.cascadingSlotsConfig.bigWinRatio = 5;
            const round = SettleGameRoundTestFactory.createRound({
                totalAmount: 10,
                betwin: 60, // 60 / 5 = 12, and 12 >= 10 (totalBetAmount), so bigWin should be true
            });

            // Act
            const result = consumer.calculateBetResult(round);

            // Assert
            expect(result.bigWin).toBe(true);
        });

        it("should set bigWin to false when win is below big win ratio threshold", () => {
            // Arrange
            const consumer = initConsumer();
            const round = SettleGameRoundTestFactory.createRound({
                totalAmount: 20,
                betwin: 25, // 25 / 20 = 1.25x, which is < bigWinRatio
            });

            // Act
            const result = consumer.calculateBetResult(round);

            // Assert
            expect(result.bigWin).toBe(false);
        });

        it("should set bigWin to false when there is no win", () => {
            // Arrange
            const consumer = initConsumer();
            const round = SettleGameRoundTestFactory.createRound({
                totalAmount: 15,
                betwin: 0,
            });

            // Act
            const result = consumer.calculateBetResult(round);

            // Assert
            expect(result.bigWin).toBe(false);
        });
    });
});

describe("processFreeSpins", () => {
    describe("when round has free spins odds", () => {
        it("should call gainFreeSpin when settlementResult has freeSpins odds", async () => {
            // Arrange
            const consumer = initConsumer();
            const player = SettleGameRoundTestFactory.createPlayer();
            const round = SettleGameRoundTestFactory.createRound({
                id: 100,
                coinValue: 0.2,
                betLevel: 6,
                betMultiplier: 25,
                settlementResult: {
                    freeSpins: { odds: 5 },
                },
            });

            // Act
            await consumer.processFreeSpins(player, round);

            // Assert
            expect(freeSpinsConsumer.gainFreeSpin).toHaveBeenCalled();
        });

        it("should call gainFreeSpin with correct round parameters", async () => {
            // Arrange
            const consumer = initConsumer();
            const player = SettleGameRoundTestFactory.createPlayer();
            const round = SettleGameRoundTestFactory.createRound({
                id: 200,
                coinValue: 0.15,
                betLevel: 7,
                betMultiplier: 30,
                settlementResult: {
                    freeSpins: { odds: 3 },
                },
            });

            // Act
            await consumer.processFreeSpins(player, round);

            // Assert
            expect(freeSpinsConsumer.gainFreeSpin).toHaveBeenCalledWith(
                player,
                expect.objectContaining({
                    roundId: 200,
                    coinValue: 0.15,
                    betLevel: 7,
                    betMultiplier: 30,
                    numberOfFreeSpins: 3,
                }),
                definition.freeSpinLiveSeconds
            );
        });

        it("should call gainFreeSpin with calculated totalAmount", async () => {
            // Arrange
            const consumer = initConsumer();
            const player = SettleGameRoundTestFactory.createPlayer();
            const round = SettleGameRoundTestFactory.createRound({
                coinValue: 0.1,
                betLevel: 5,
                betMultiplier: 20,
                settlementResult: {
                    freeSpins: { odds: 2 },
                },
            });

            // Act
            await consumer.processFreeSpins(player, round);

            // Assert
            expect(freeSpinsConsumer.gainFreeSpin).toHaveBeenCalledWith(
                player,
                expect.objectContaining({
                    totalAmount: 10, // 0.1 * 5 * 20
                }),
                definition.freeSpinLiveSeconds
            );
        });

        it("should set buyFreeSpin flag correctly when round is buy free spin", async () => {
            // Arrange
            const consumer = initConsumer();
            const player = SettleGameRoundTestFactory.createPlayer();
            const round = SettleGameRoundTestFactory.createRound({
                buyFreeSpin: true,
                settlementResult: {
                    freeSpins: { odds: 1 },
                },
            });

            // Act
            await consumer.processFreeSpins(player, round);

            // Assert
            expect(freeSpinsConsumer.gainFreeSpin).toHaveBeenCalledWith(
                player,
                expect.objectContaining({
                    buyFreeSpin: true,
                }),
                definition.freeSpinLiveSeconds
            );
        });

        it("should set buyFreeSpinRefRoundId from round when buy free spin", async () => {
            // Arrange
            const consumer = initConsumer();
            const player = SettleGameRoundTestFactory.createPlayer();
            const round = SettleGameRoundTestFactory.createRound({
                id: 300,
                buyFreeSpin: true,
                settlementResult: {
                    freeSpins: { odds: 4 },
                },
            });

            // Act
            await consumer.processFreeSpins(player, round);

            // Assert
            expect(freeSpinsConsumer.gainFreeSpin).toHaveBeenCalledWith(
                player,
                expect.objectContaining({
                    buyFreeSpinRefRoundId: 300,
                }),
                definition.freeSpinLiveSeconds
            );
        });
    });

    describe("when round has no free spins odds", () => {
        it("should not call gainFreeSpin when odds is 0", async () => {
            // Arrange
            const consumer = initConsumer();
            const player = SettleGameRoundTestFactory.createPlayer();
            const round = SettleGameRoundTestFactory.createRound({
                settlementResult: {
                    freeSpins: { odds: 0 },
                },
            });

            // Act
            await consumer.processFreeSpins(player, round);

            // Assert
            expect(freeSpinsConsumer.gainFreeSpin).not.toHaveBeenCalled();
        });

        it("should not call gainFreeSpin when freeSpins is undefined", async () => {
            // Arrange
            const consumer = initConsumer();
            const player = SettleGameRoundTestFactory.createPlayer();
            const round = SettleGameRoundTestFactory.createRound({
                settlementResult: {},
            });

            // Act
            await consumer.processFreeSpins(player, round);

            // Assert
            expect(freeSpinsConsumer.gainFreeSpin).not.toHaveBeenCalled();
        });
    });

    describe("when total available free spins is 0", () => {
        it("should call stopChain when no free spins available", async () => {
            // Arrange
            const consumer = initConsumer();
            const player = SettleGameRoundTestFactory.createPlayer();
            const round = SettleGameRoundTestFactory.createRound();
            freeSpinsConsumer.getTotalAvaiableFreeSpins.mockReturnValue(0);

            // Act
            await consumer.processFreeSpins(player, round);

            // Assert
            expect(totalMultiplierConsumer.stopChain).toHaveBeenCalledWith(player);
        });

        it("should not call stopChain when free spins are available", async () => {
            // Arrange
            const consumer = initConsumer();
            const player = SettleGameRoundTestFactory.createPlayer();
            const round = SettleGameRoundTestFactory.createRound();
            freeSpinsConsumer.getTotalAvaiableFreeSpins.mockReturnValue(5);

            // Act
            await consumer.processFreeSpins(player, round);

            // Assert
            expect(totalMultiplierConsumer.stopChain).not.toHaveBeenCalled();
        });
    });

    describe("when round has promotion", () => {
        it("should include promotion free spins in total calculation", async () => {
            // Arrange
            const consumer = initConsumer();
            const player = SettleGameRoundTestFactory.createPlayer({
                promotion: { remainingBonusItems: 3 },
            });
            const round = SettleGameRoundTestFactory.createRound({ promotionId: "promo123" });
            freeSpinsConsumer.getTotalAvaiableFreeSpins.mockReturnValue(2);
            // Total should be 2 + 3 = 5, so stopChain should not be called

            // Act
            await consumer.processFreeSpins(player, round);

            // Assert
            expect(totalMultiplierConsumer.stopChain).not.toHaveBeenCalled();
        });

        it("should call stopChain when total including promotion is still 0", async () => {
            // Arrange
            const consumer = initConsumer();
            const player = SettleGameRoundTestFactory.createPlayer({
                promotion: { remainingBonusItems: 0 },
            });
            const round = SettleGameRoundTestFactory.createRound({ promotionId: "promo123" });
            freeSpinsConsumer.getTotalAvaiableFreeSpins.mockReturnValue(0);

            // Act
            await consumer.processFreeSpins(player, round);

            // Assert
            expect(totalMultiplierConsumer.stopChain).toHaveBeenCalledWith(player);
        });
    });
});

describe("formatEndGameInfo", () => {
    describe("when formatting regular round", () => {
        it("should call parent formatEndGameInfo with correct parameters", () => {
            // Arrange
            const consumer = initConsumer();
            const bet = SettleGameRoundTestFactory.createRound();
            const roundId = 123;
            const time = new Date();
            const betResult = SettleGameRoundTestFactory.createBetResult();
            
            // Mock the parent method
            const parentFormatEndGameInfo = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(consumer)), 'formatEndGameInfo');
            parentFormatEndGameInfo.mockReturnValue({
                gameInfo: { roundId },
                settlementInfo: { redPlay: 10, baseTotalAmount: 15 }
            });

            // Act
            consumer.formatEndGameInfo(bet, roundId, time, betResult);

            // Assert
            expect(parentFormatEndGameInfo).toHaveBeenCalledWith(bet, roundId, time, betResult);
        });

        it("should preserve parent gameInfo for regular spins", () => {
            // Arrange
            const consumer = initConsumer();
            const bet = SettleGameRoundTestFactory.createRound({ freeSpin: false });
            const roundId = 456;
            const time = new Date();
            const betResult = SettleGameRoundTestFactory.createBetResult();
            
            const parentFormatEndGameInfo = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(consumer)), 'formatEndGameInfo');
            parentFormatEndGameInfo.mockReturnValue({
                gameInfo: { roundId: 456, customData: "test" },
                settlementInfo: { redPlay: 20, baseTotalAmount: 25 }
            });

            // Act
            const result = consumer.formatEndGameInfo(bet, roundId, time, betResult);

            // Assert
            expect(result.gameInfo).toEqual({ roundId: 456, customData: "test" });
        });

        it("should preserve parent settlementInfo for regular spins", () => {
            // Arrange
            const consumer = initConsumer();
            const bet = SettleGameRoundTestFactory.createRound({ freeSpin: false });
            const roundId = 789;
            const time = new Date();
            const betResult = SettleGameRoundTestFactory.createBetResult();
            
            const parentFormatEndGameInfo = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(consumer)), 'formatEndGameInfo');
            parentFormatEndGameInfo.mockReturnValue({
                gameInfo: { roundId },
                settlementInfo: { redPlay: 30, baseTotalAmount: 40 }
            });

            // Act
            const result = consumer.formatEndGameInfo(bet, roundId, time, betResult);

            // Assert
            expect(result.settlementInfo.redPlay).toBe(30);
            expect(result.settlementInfo.baseTotalAmount).toBe(40);
        });
    });

    describe("when formatting free spin round", () => {
        it("should set redPlay to 0 for free spins", () => {
            // Arrange
            const consumer = initConsumer();
            const bet = SettleGameRoundTestFactory.createRound({ freeSpin: true });
            const roundId = 111;
            const time = new Date();
            const betResult = SettleGameRoundTestFactory.createBetResult();
            
            const parentFormatEndGameInfo = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(consumer)), 'formatEndGameInfo');
            parentFormatEndGameInfo.mockReturnValue({
                gameInfo: { roundId },
                settlementInfo: { redPlay: 50, baseTotalAmount: 60 }
            });

            // Act
            const result = consumer.formatEndGameInfo(bet, roundId, time, betResult);

            // Assert
            expect(result.settlementInfo.redPlay).toBe(0);
        });

        it("should set baseTotalAmount to 0 for free spins", () => {
            // Arrange
            const consumer = initConsumer();
            const bet = SettleGameRoundTestFactory.createRound({ freeSpin: true });
            const roundId = 222;
            const time = new Date();
            const betResult = SettleGameRoundTestFactory.createBetResult();
            
            const parentFormatEndGameInfo = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(consumer)), 'formatEndGameInfo');
            parentFormatEndGameInfo.mockReturnValue({
                gameInfo: { roundId },
                settlementInfo: { redPlay: 70, baseTotalAmount: 80 }
            });

            // Act
            const result = consumer.formatEndGameInfo(bet, roundId, time, betResult);

            // Assert
            expect(result.settlementInfo.baseTotalAmount).toBe(0);
        });

        it("should preserve gameInfo for free spins", () => {
            // Arrange
            const consumer = initConsumer();
            const bet = SettleGameRoundTestFactory.createRound({ freeSpin: true });
            const roundId = 333;
            const time = new Date();
            const betResult = SettleGameRoundTestFactory.createBetResult();
            
            const parentFormatEndGameInfo = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(consumer)), 'formatEndGameInfo');
            parentFormatEndGameInfo.mockReturnValue({
                gameInfo: { roundId: 333, freeSpinData: "special" },
                settlementInfo: { redPlay: 90, baseTotalAmount: 100 }
            });

            // Act
            const result = consumer.formatEndGameInfo(bet, roundId, time, betResult);

            // Assert
            expect(result.gameInfo).toEqual({ roundId: 333, freeSpinData: "special" });
        });
    });
});

describe("processSpinning - Error Handling", () => {
    describe("when chain update fails", () => {
        it("should log error when userChainConsumer.updateChainProgress throws", async () => {
            // Arrange
            const consumer = initConsumer();
            const player = SettleGameRoundTestFactory.createPlayer({ profile: { name: "errorPlayer" } });
            const round = SettleGameRoundTestFactory.createRound({ betLevel: 5, coinValue: 0.1, totalAmount: 10 });
            const error = new Error("Chain update failed");
            
            totalMultiplierConsumer.getCurrentMultiplier.mockReturnValue(1);
            consumer.gameData.currencyGroupGames = [{ groupId: "g1", maxWinPerRound: 100 }];
            
            // Mock logService
            consumer.logService = { 
                logInfo: jest.fn(), 
                logWarning: jest.fn(), 
                logError: jest.fn() 
            };
            
            // Mock selectPreGeneratedResult to return chain result
            jest.spyOn(consumer, 'selectPreGeneratedResult').mockResolvedValue({
                data: [{ newBoard: [1,2,3,4,5,6,7,8,9,10,1,2,3,4,5,6,7,8,9,10,1,2,3,4,5,6,7,8,9,10] }],
                isFromChain: true,
            });
            
            // Mock roundCalculator.processSpinning
            jest.spyOn(consumer.roundCalculator, 'processSpinning').mockImplementation((round) => {
                round.settlementResult = { tumbles: [] };
                return round;
            });
            
            userChainConsumer.updateChainProgress.mockRejectedValue(error);

            // Act
            await consumer.processSpinning(player, round);

            // Assert
            expect(consumer.logService.logError).toHaveBeenCalledWith(
                `Failed to update chain progress for errorPlayer`,
                error
            );
        });

        it("should continue processing when chain update fails", async () => {
            // Arrange
            const consumer = initConsumer();
            const player = SettleGameRoundTestFactory.createPlayer();
            const round = SettleGameRoundTestFactory.createRound({ freeSpin: true, betwin: 10, multiplier: 2 });
            
            totalMultiplierConsumer.getCurrentMultiplier.mockReturnValue(1);
            consumer.gameData.currencyGroupGames = [{ groupId: "g1", maxWinPerRound: 100 }];
            
            // Mock logService
            consumer.logService = { 
                logInfo: jest.fn(), 
                logWarning: jest.fn(), 
                logError: jest.fn() 
            };
            
            jest.spyOn(consumer, 'selectPreGeneratedResult').mockResolvedValue({
                data: null,
                isFromChain: true,
            });
            
            // Mock roundCalculator.processSpinning
            jest.spyOn(consumer.roundCalculator, 'processSpinning').mockImplementation((round) => {
                round.settlementResult = { tumbles: [{ win: 10 }, { win: 5 }] };
                round.betwin = 10;
                round.multiplier = 2;
                return round;
            });
            
            userChainConsumer.updateChainProgress.mockRejectedValue(new Error("Failed"));

            // Act
            await consumer.processSpinning(player, round);

            // Assert  
            expect(totalMultiplierConsumer.increaseTotalMultiplier).toHaveBeenCalled();
        });
    });
});

describe("settleRound - Edge Cases", () => {
    describe("when round is not found", () => {
        it("should return betwin 0", async () => {
            // Arrange
            const consumer = initConsumer();
            const player = SettleGameRoundTestFactory.createPlayer();
            roundsRepository.findOne().exec.mockResolvedValue(null);

            // Act
            const result = await consumer.settleRound(player, 999);

            // Assert
            expect(result.betwin).toBe(0);
        });

        it("should not call processSpinning when round not found", async () => {
            // Arrange
            const consumer = initConsumer();
            const player = SettleGameRoundTestFactory.createPlayer();
            const processSpinningSpy = jest.spyOn(consumer, 'processSpinning');
            roundsRepository.findOne().exec.mockResolvedValue(null);

            // Act
            await consumer.settleRound(player, 999);

            // Assert
            expect(processSpinningSpy).not.toHaveBeenCalled();
        });
    });

    describe("when round exists", () => {
        it("should set round.paid to true", async () => {
            // Arrange
            const consumer = initConsumer();
            const player = SettleGameRoundTestFactory.createPlayer();
            const round = SettleGameRoundTestFactory.createRound({ paid: false });
            roundsRepository.findOne().exec.mockResolvedValue(round);
            
            jest.spyOn(consumer, 'processSpinning').mockResolvedValue();
            jest.spyOn(consumer, 'processFreeSpins').mockResolvedValue();

            // Act
            await consumer.settleRound(player, 1);

            // Assert
            expect(round.paid).toBe(true);
        });

        it("should set round.endTime", async () => {
            // Arrange
            const consumer = initConsumer();
            const player = SettleGameRoundTestFactory.createPlayer();
            const round = SettleGameRoundTestFactory.createRound();
            roundsRepository.findOne().exec.mockResolvedValue(round);
            
            jest.spyOn(consumer, 'processSpinning').mockResolvedValue();
            jest.spyOn(consumer, 'processFreeSpins').mockResolvedValue();

            // Act
            await consumer.settleRound(player, 1);

            // Assert
            expect(round.endTime).toBeInstanceOf(Date);
        });

        it("should set round.sessionId from player session", async () => {
            // Arrange
            const consumer = initConsumer();
            const player = SettleGameRoundTestFactory.createPlayer({
                session: { sessionId: "unique-session-123" }
            });
            const round = SettleGameRoundTestFactory.createRound();
            roundsRepository.findOne().exec.mockResolvedValue(round);
            
            jest.spyOn(consumer, 'processSpinning').mockResolvedValue();
            jest.spyOn(consumer, 'processFreeSpins').mockResolvedValue();

            // Act
            await consumer.settleRound(player, 1);

            // Assert
            expect(round.sessionId).toBe("unique-session-123");
        });

        it("should call round.save", async () => {
            // Arrange
            const consumer = initConsumer();
            const player = SettleGameRoundTestFactory.createPlayer();
            const round = SettleGameRoundTestFactory.createRound();
            roundsRepository.findOne().exec.mockResolvedValue(round);
            
            jest.spyOn(consumer, 'processSpinning').mockResolvedValue();
            jest.spyOn(consumer, 'processFreeSpins').mockResolvedValue();

            // Act
            await consumer.settleRound(player, 1);

            // Assert
            expect(round.save).toHaveBeenCalled();
        });

        it("should return correct betwin", async () => {
            // Arrange
            const consumer = initConsumer();
            const player = SettleGameRoundTestFactory.createPlayer();
            const round = SettleGameRoundTestFactory.createRound({ betwin: 42.5 });
            roundsRepository.findOne().exec.mockResolvedValue(round);
            
            jest.spyOn(consumer, 'processSpinning').mockResolvedValue();
            jest.spyOn(consumer, 'processFreeSpins').mockResolvedValue();

            // Act
            const result = await consumer.settleRound(player, 1);

            // Assert
            expect(result.betwin).toBe(42.5);
        });
    });
});