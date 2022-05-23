import { stub, stubMongoose } from "jest-micro-auto-stub";
import mongoose from "mongoose";
import Chance from "chance";
import { FreeSpinsConsumer } from "..";
import { SlotGameData, EventConsumers } from "sc-slot-game-base";

describe("freeSpinsConsumer", () => {
    const chance = new Chance();

    const gameData = stubGameData();

    /** @type {mongoose.Model}*/
    const freeSpinsRepository = stubMongoose(mongoose.Model);

    /** @type {mongoose.Model}*/
    const gameNotificationsRepository = stubMongoose(mongoose.Model);

    const idCountersConsumer = stub(EventConsumers.IdCountersConsumer);

    let consumer;

    beforeEach(() => {
        jest.clearAllMocks();
        consumer = new FreeSpinsConsumer(chance.natural(), gameData, freeSpinsRepository, gameNotificationsRepository, idCountersConsumer);
    });

    describe("gainFreeSpin", () => {
        const player = {
            profile: { name: chance.name_suffix() },
        };
        const freeSpinData = {
            roundId: chance.natural(),
            bet: chance.natural(),
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
                memberId: player.session?.memberId,
                name: player.profile.name,
                playerId: player.session?.memberId,
                id: gameData.freeSpinId,
                roundId: freeSpinData.roundId,
                bet: freeSpinData.bet,
                total: freeSpinData.numberOfFreeSpins,
                available: freeSpinData.numberOfFreeSpins,
                time: mockDate,
                expiryTime: new Date(mockDate.getTime()).setSeconds(mockDate.getSeconds() + timeToLive),
                betLevel: freeSpinData.betLevel,
                coinValue: freeSpinData.coinValue,
                betMultiplier: gameData.gameConfigs.slotsConfig.betMultiplier,
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
                    bet: freeSpinData.bet,
                    total: freeSpinData.numberOfFreeSpins,
                    available: freeSpinData.numberOfFreeSpins,
                    time: mockDate,
                    expiryTime: new Date(mockDate.getTime()).setSeconds(mockDate.getSeconds() + timeToLive),
                    betLevel: freeSpinData.betLevel,
                    coinValue: freeSpinData.coinValue,
                    betMultiplier: gameData.gameConfigs.slotsConfig.betMultiplier,
                },
            ]);
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
        slotsConfig: {
            betMultiplier: 20,
        },
    };
    gameData.freeSpinId = 1;

    return gameData;
}
