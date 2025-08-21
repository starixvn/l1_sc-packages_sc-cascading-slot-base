import { stub, stubMongoose } from "jest-micro-auto-stub";
import mongoose from "mongoose";
import { BaseEventPublishers, RoundQuery } from "sc-game-base/src/core";
import { EventConsumers } from "sc-slot-game-base";
import { FreeSpinsConsumer } from "sc-slot-game-base/src/event-consumers/free-spins-consumer";
import SlotGameData from "sc-slot-game-base/src/slot-game-data";
import SlotGameDefinition from "sc-slot-game-base/src/slot-game-definition";
import InGameConsumer from "../in-game-consumer";

const definition = stubGameDefinition();
const gameData = stubGameData();
const publisher = stub(BaseEventPublishers);
const roundQuery = stub(RoundQuery);

const userInfosRepository = stubMongoose(mongoose.Model);
const currencyGroupGamesRepository = stubMongoose(mongoose.Model);
const totalMultiplierRepository = stubMongoose(mongoose.Model);
const freeSpinsConsumer = stub(FreeSpinsConsumer);
const getBalance = jest.fn();

function stubGameDefinition() {
    return new SlotGameDefinition({ id: 47 });
}

function stubGameData() {
    const result = new SlotGameData();

    result.remainingTime = 20;
    result.gameConfigs = {
        enabled: true,
        cascadingSlotsConfig: {
            betLevels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            betMultiplier: 20,
            oddsByCounts: [{ from: 8, to: 9, odds: 1 }],
            freeSpins: {
                initialOdds: [],
                additionalOdds: [],
            },
        },
    };

    result.exchangeRates = { code: { UUS: 2 } };
    result.currencyGroupGames = [
        {
            groupId: "617a650628b7a500016388f5",
            coinValues: [1, 2, 5, 10, 50, 100],
            maxWinPerRound: 5000,
        },
    ];

    result.ingame = { player1: { totalMultiplier: 10 } };

    return result;
}

describe("InGameConsumer", () => {
    let consumer;

    beforeEach(() => {
        jest.clearAllMocks();
        consumer = new InGameConsumer({
            definition,
            gameData,
            roundQuery,
            publisher,
            freeSpinsConsumer,
            getBalance,
            userInfosRepository,
            currencyGroupGamesRepository,
            totalMultiplierRepository,
        });

        freeSpinsConsumer.getTotalAvaiableFreeSpins.mockReturnValueOnce(10);
        userInfosRepository.findOne().lean().exec.mockReturnValueOnce({});
    });

    it("should inherit EventConsumers.InGameConsumer", async () => {
        // Assert
        expect(consumer instanceof EventConsumers.InGameConsumer);
    });

    describe("buildPayload", () => {
        describe("when player not have currency group game settings", () => {
            it("should return info without coinValues and maxWinPerRound", async () => {
                // Arrange
                const realPlayer = { session: { currencyGroupId: "1", currencyCode: "UUS", multiplier: 2 }, profile: { name: "player1" } };
                freeSpinsConsumer.getSoonestExpiredFreeSpinSet.mockReturnValueOnce(null);

                // Arrange
                const expectedValue = {
                    gameConfigs: {
                        coinValues: undefined,
                        maxWinPerRound: undefined,
                        betLevels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
                        betMultiplier: 20,
                        odds: {
                            symbols: [{ from: 8, to: 9, odds: 1 }],
                            freeSpins: {
                                initialOdds: [],
                                additionalOdds: [],
                            },
                        },
                    },
                    freeSpins: {
                        total: 10,
                        betLevel: undefined,
                        coinValue: undefined,
                        betMultiplier: undefined,
                    },
                    totalMultiplier: 10,
                    user: {
                        rate: 4,
                        multiplier: 2,
                    },
                };

                // Act
                const actualValue = await consumer.buildPayload(realPlayer);

                // Assert
                expect(actualValue).toStrictEqual(expectedValue);
            });
        });

        describe("when player have currency group game settings", () => {
            it("should return info coinValues and maxWinPerRound", async () => {
                // Arrange
                freeSpinsConsumer.getSoonestExpiredFreeSpinSet.mockReturnValueOnce({ betLevel: 2, coinValue: 10, betMultiplier: 20 });
                const realPlayer = {
                    session: { currencyGroupId: "617a650628b7a500016388f5", currencyCode: "UUS", multiplier: 2 },
                    profile: { name: "player2" },
                };

                // Arrange
                const expectedValue = {
                    gameConfigs: {
                        coinValues: [1, 2, 5, 10, 50, 100],
                        maxWinPerRound: 5000,
                        betLevels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
                        betMultiplier: 20,
                        odds: {
                            symbols: [{ from: 8, to: 9, odds: 1 }],
                            freeSpins: {
                                initialOdds: [],
                                additionalOdds: [],
                            },
                        },
                    },
                    freeSpins: {
                        total: 10,
                        betLevel: 2,
                        betMultiplier: 20,
                        coinValue: 10,
                    },
                    totalMultiplier: 0,
                    user: {
                        rate: 4,
                        multiplier: 2,
                    },
                };

                // Act
                const actualValue = await consumer.buildPayload(realPlayer);

                // Assert
                expect(actualValue).toStrictEqual(expectedValue);
            });
        });
    });
});
