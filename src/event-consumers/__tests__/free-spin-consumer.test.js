import { stub, stubMongoose } from "jest-micro-auto-stub";
import mongoose from "mongoose";
import Chance from "chance";
import { FreeSpinsConsumer, TotalMultiplierConsumer } from "../index";
import { SlotGameData, EventConsumers } from "sc-slot-game-base";

describe("freeSpinsConsumer", () => {
    const chance = new Chance();

    const gameData = stubGameData();

    /** @type {mongoose.Model}*/
    const freeSpinsRepository = stubMongoose(mongoose.Model);

    /** @type {mongoose.Model}*/
    const gameNotificationsRepository = stubMongoose(mongoose.Model);

    const idCountersConsumer = stub(EventConsumers.IdCountersConsumer);

    const totalMultiplierConsumer = stub(TotalMultiplierConsumer);

    const player = {
        profile: { name: chance.name_suffix() },
    };

    let consumer;

    beforeEach(() => {
        jest.clearAllMocks();
        consumer = new FreeSpinsConsumer(
            chance.natural(),
            gameData,
            freeSpinsRepository,
            gameNotificationsRepository,
            idCountersConsumer,
            totalMultiplierConsumer
        );
    });

    describe("gainFreeSpin", () => {
        const freeSpinData = {
            roundId: chance.natural(),
            totalAmount: chance.natural(),
            betLevel: chance.pickone([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
            coinValue: chance.floating({ min: 1, max: 20, fixed: 1 }),
            numberOfFreeSpins: chance.pickone([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
        };
        const timeToLive = chance.natural();

        it("should call idCountersConsumer.consume", async () => {
            // Act
            await consumer.gainFreeSpin(player, freeSpinData, timeToLive);

            // Assert
            expect(idCountersConsumer.consume).toBeCalledWith("freespin");
        });

        it("should call freeSpinsRepository.create", async () => {
            // Arrange
            const mockDate = new Date();
            jest.spyOn(global, "Date").mockReturnValue(mockDate);

            // Act
            await consumer.gainFreeSpin(player, freeSpinData, timeToLive);

            // Assert
            expect(freeSpinsRepository.create).toBeCalledWith({
                uid: player.UID,
                name: player.profile.name,
                playerId: player.session?.memberId,
                id: gameData.freeSpinId,
                roundId: freeSpinData.roundId,
                bet: freeSpinData.totalAmount,
                total: freeSpinData.numberOfFreeSpins,
                available: freeSpinData.numberOfFreeSpins,
                time: mockDate,
                expiryTime: new Date(mockDate.getTime()).setSeconds(mockDate.getSeconds() + timeToLive),
                betLevel: freeSpinData.betLevel,
                coinValue: freeSpinData.coinValue,
                betMultiplier: gameData.gameConfigs.cascadingSlotsConfig.betMultiplier,
                buyFreeSpinRefRoundId: undefined,
            });
        });

        it("should set player free spins to ingame data", async () => {
            // Arrange
            const mockDate = new Date();
            jest.spyOn(global, "Date").mockReturnValue(mockDate);
            gameData.ingame[player.profile.name] = {};
            freeSpinsRepository.create.mockResolvedValueOnce({ id: 2 });

            // Act
            await consumer.gainFreeSpin(player, freeSpinData, timeToLive);

            // Assert
            expect(gameData.ingame[player.profile.name].freeSpins).toStrictEqual([
                {
                    id: 2,
                    roundId: freeSpinData.roundId,
                    bet: freeSpinData.totalAmount,
                    total: freeSpinData.numberOfFreeSpins,
                    available: freeSpinData.numberOfFreeSpins,
                    time: mockDate,
                    expiryTime: new Date(mockDate.getTime()).setSeconds(mockDate.getSeconds() + timeToLive),
                    betLevel: freeSpinData.betLevel,
                    coinValue: freeSpinData.coinValue,
                    betMultiplier: gameData.gameConfigs.cascadingSlotsConfig.betMultiplier,
                    buyFreeSpinRefRoundId: undefined,
                },
            ]);
        });
    });

    describe("useFreeSpin", () => {
        it("should return first available free spin set", async () => {
            // Arrange
            const mockFreeSpin = { id: 1, available: 3 };
            gameData.ingame[player.profile.name] = {
                freeSpins: [mockFreeSpin],
            };

            // Act
            const result = await consumer.useFreeSpin(player);

            // Assert
            expect(result).toBe(mockFreeSpin);
            expect(freeSpinsRepository.updateOne).toBeCalledWith({ id: mockFreeSpin.id }, { $inc: { available: -1 } });
        });

        it("should return undefined when no free spins available", async () => {
            // Arrange
            gameData.ingame[player.profile.name] = {
                freeSpins: [],
            };

            // Act
            const result = await consumer.useFreeSpin(player);

            // Assert
            expect(result).toBeUndefined();
            expect(freeSpinsRepository.updateOne).not.toBeCalled();
        });

        it("should return undefined when player not in ingame", async () => {
            // Act
            const result = await consumer.useFreeSpin(player);

            // Assert
            expect(result).toBeUndefined();
            expect(freeSpinsRepository.updateOne).not.toBeCalled();
        });
    });

    describe("hasFreeSpin", () => {
        it("should return true when player has available free spins", () => {
            // Arrange
            gameData.ingame[player.profile.name] = {
                freeSpins: [{ available: 2 }],
            };

            // Act
            const result = consumer.hasFreeSpin(player);

            // Assert
            expect(result).toBe(true);
        });

        it("should return false when player has no free spins", () => {
            // Arrange
            gameData.ingame[player.profile.name] = {
                freeSpins: [],
            };

            // Act
            const result = consumer.hasFreeSpin(player);

            // Assert
            expect(result).toBe(false);
        });

        it("should return false when player has no available free spins", () => {
            // Arrange
            gameData.ingame[player.profile.name] = {
                freeSpins: [{ available: 0 }],
            };

            // Act
            const result = consumer.hasFreeSpin(player);

            // Assert
            expect(result).toBe(false);
        });

        it("should return false when player not in ingame", () => {
            // Act
            const result = consumer.hasFreeSpin(player);

            // Assert
            expect(result).toBe(false);
        });
    });

    describe("getSoonestExpiredFreeSpinSet", () => {
        it("should return first available free spin", () => {
            // Arrange
            const freeSpin1 = { available: 0 };
            const freeSpin2 = { available: 2 };
            const freeSpin3 = { available: 1 };

            gameData.ingame[player.profile.name] = {
                freeSpins: [freeSpin1, freeSpin2, freeSpin3],
            };

            // Act
            const result = consumer.getSoonestExpiredFreeSpinSet(player);

            // Assert
            expect(result).toBe(freeSpin2);
        });

        it("should return undefined when no available free spins", () => {
            // Arrange
            gameData.ingame[player.profile.name] = {
                freeSpins: [{ available: 0 }],
            };

            // Act
            const result = consumer.getSoonestExpiredFreeSpinSet(player);

            // Assert
            expect(result).toBeUndefined();
        });

        it("should return undefined when player not in ingame", () => {
            // Act
            const result = consumer.getSoonestExpiredFreeSpinSet(player);

            // Assert
            expect(result).toBeUndefined();
        });
    });

    describe("getLatestExpiredFreeSpinSet", () => {
        it("should return last available free spin", () => {
            // Arrange
            const freeSpin1 = { available: 0 };
            const freeSpin2 = { available: 2 };
            const freeSpin3 = { available: 1 };

            gameData.ingame[player.profile.name] = {
                freeSpins: [freeSpin1, freeSpin2, freeSpin3],
            };

            // Act
            const result = consumer.getLatestExpiredFreeSpinSet(player);

            // Assert
            expect(result).toBe(freeSpin3);
        });

        it("should return undefined when no available free spins", () => {
            // Arrange
            gameData.ingame[player.profile.name] = {
                freeSpins: [{ available: 0 }],
            };

            // Act
            const result = consumer.getLatestExpiredFreeSpinSet(player);

            // Assert
            expect(result).toBeUndefined();
        });
    });

    describe("getBuyFreeSpinBoard", () => {
        it("should return shuffled board with free spin symbols", () => {
            // Act
            const result = consumer.getBuyFreeSpinBoard();

            // Assert
            expect(result).toHaveLength(1);
            expect(result[0]).toHaveProperty("newBoard");
            expect(result[0]).toHaveProperty("multipliers");
            expect(result[0].newBoard).toHaveLength(30); // 26 + 4 free spin symbols
            expect(result[0].multipliers).toEqual([]);
        });
    });

    describe("summarizeBuyFreeSpins", () => {
        it("should calculate correct summary", async () => {
            // Arrange
            const buyFreeSpinRefRoundId = chance.natural();
            const mockRounds = [
                { id: buyFreeSpinRefRoundId, betwin: 100 },
                { buyFreeSpinRefRoundId, betwin: 200 },
                { buyFreeSpinRefRoundId, betwin: 150 },
            ];

            consumer.roundsRepository = {
                find: jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue(mockRounds),
                    }),
                }),
            };

            // Act
            const result = await consumer.summarizeBuyFreeSpins(player, buyFreeSpinRefRoundId);

            // Assert
            expect(result.numberOfFreeSpins).toBe(2); // total rounds - 1
            expect(result.totalWin).toBe(450); // sum of all betwins
        });

        it("should handle empty rounds", async () => {
            // Arrange
            const buyFreeSpinRefRoundId = chance.natural();

            consumer.roundsRepository = {
                find: jest.fn().mockReturnValue({
                    lean: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue([]),
                    }),
                }),
            };

            // Act
            const result = await consumer.summarizeBuyFreeSpins(player, buyFreeSpinRefRoundId);

            // Assert
            expect(result.numberOfFreeSpins).toBe(0);
            expect(result.totalWin).toBe(0);
        });
    });
});

function stubGameData() {
    const gameData = new SlotGameData();

    gameData.remainingTime = 20;
    gameData.gameConfigs = {
        enabled: true,
        minbet: 1,
        maxbet: 1000,
        cascadingSlotsConfig: {
            betMultiplier: 20,
        },
    };
    gameData.freeSpinId = 1;

    return gameData;
}
