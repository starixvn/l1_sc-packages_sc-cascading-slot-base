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

afterEach(() => {
    jest.clearAllMocks();
});
