import { stub, stubMongoose } from "jest-micro-auto-stub";
import mongoose from "mongoose";
import { SlotGameData } from "sc-slot-game-base";
import { TotalMultiplierConsumer } from "..";
import { FreeSpinConsumer } from "../";
import { UserInfo, UserSession } from "jest-auto-fixture/src/models";
import { Chance } from "chance";

describe("totalMultiplierConsumer", () => {
    let consumer;

    const chance = new Chance();

    const gameData = stubGameData();

    /** @type {mongoose.Model}*/
    const totalMultiplierRepository = stubMongoose(mongoose.Model);

    const freeSpinConsumer = stub(FreeSpinConsumer);

    const player = stubPlayer();

    const mockDate = new Date();

    beforeEach(() => {
        jest.clearAllMocks();

        gameData.ingame[player.profile.name] = {};
        consumer = new TotalMultiplierConsumer(gameData, totalMultiplierRepository, freeSpinConsumer);
        jest.spyOn(global, "Date").mockReturnValue(mockDate);
    });

    describe("increaseTotalMultiplier", () => {
        const data = { roundId: chance.natural(), multiplier: chance.natural() };

        beforeEach(() => {
            freeSpinConsumer.hasFreeSpin.mockReturnValueOnce(true);
        });

        it("should assign total multiplier value to ingame data", async () => {
            // Act
            await consumer.increaseTotalMultiplier(player, data);

            // Assert
            expect(gameData.ingame[player.profile.name].totalMultiplier).toBe(data.multiplier);
        });

        describe("when current total multiplier is 0", () => {
            it("should call totalMultiplierRepository.create", async () => {
                // Arrange
                const newRoundRecord = {
                    time: mockDate,
                    roundId: data.roundId,
                    prevTotalMultiplier: 0,
                    totalMultiplier: data.multiplier,
                    multiplier: data.multiplier,
                };

                // Act
                await consumer.increaseTotalMultiplier(player, data);

                // Assert
                expect(totalMultiplierRepository.create).toBeCalledWith({
                    uid: player.UID,
                    playerId: player.session?.memberId,
                    name: player.profile.name,
                    ended: false,
                    time: mockDate,
                    rounds: [newRoundRecord],
                });
            });
        });

        describe("when current total multiplier is NOT 0", () => {
            it("should call totalMultiplierRepository.updateOne", async () => {
                // Arrange
                const currentTotalMultiplier = chance.natural();
                gameData.ingame[player.profile.name].totalMultiplier = currentTotalMultiplier;

                const newRoundRecord = {
                    time: mockDate,
                    roundId: data.roundId,
                    prevTotalMultiplier: currentTotalMultiplier,
                    totalMultiplier: data.multiplier + currentTotalMultiplier,
                    multiplier: data.multiplier,
                };

                // Act
                await consumer.increaseTotalMultiplier(player, data);

                // Assert
                expect(totalMultiplierRepository.updateOne).toBeCalledWith(
                    {
                        uid: player.UID,
                        ended: false,
                    },
                    {
                        $push: {
                            rounds: newRoundRecord,
                        },
                    }
                );
            });
        });
    });

    describe("getCurrentMultiplier", () => {
        describe("when user total multiplier is undefined", () => {
            it("should return 0", () => {
                // Act
                const actualResult = consumer.getCurrentMultiplier(player);

                // Assert
                expect(actualResult).toBe(0);
            });
        });

        describe("when user total multiplier is valid", () => {
            it("should return user total multiplier", () => {
                // Arrange
                const totalMultiplier = chance.natural();
                gameData.ingame[player.profile.name] = { totalMultiplier };

                // Act
                const actualResult = consumer.getCurrentMultiplier(player);

                // Asset
                expect(actualResult).toBe(totalMultiplier);
            });
        });
    });

    describe("stopChain", () => {
        it("should call totalMultiplierRepository.updateOne", async () => {
            // Act
            await consumer.stopChain(player);

            // Assert
            expect(totalMultiplierRepository.updateOne).toBeCalledWith({ uid: player.UID, ended: false }, { ended: true, endTime: mockDate });
        });

        it("should set user total multiplier ingame to 0", async () => {
            // Arrange
            gameData.ingame[player.profile.name].totalMultiplier = chance.natural();

            // Act
            await consumer.stopChain(player);

            // Assert
            expect(gameData.ingame[player.profile.name].totalMultiplier).toBe(0);
        });
    });

    describe("reload", () => {
        it("should call totalMultiplier.find", async () => {
            // Arrange
            totalMultiplierRepository.find().lean().exec.mockReturnValueOnce([]);

            // Act
            await consumer.reload();

            // Assert
            expect(totalMultiplierRepository.find).toHaveBeenCalledWith({ ended: false });
        });

        describe("when player has freeSpins", () => {
            it("should set total multiplier to ingame data", async () => {
                // Arrange
                const totalMultiplier = chance.natural();
                const records = [{ name: player.profile.name, rounds: [{ totalMultiplier }] }];
                totalMultiplierRepository.find().lean().exec.mockReturnValueOnce(records);
                freeSpinConsumer.hasFreeSpin = jest.fn().mockReturnValue(true);

                // Act
                await consumer.reload();

                // Assert
                expect(gameData.ingame[player.profile.name].totalMultiplier).toBe(totalMultiplier);
            });
        });

        describe("when player does NOT have free spin", () => {
            const totalMultiplier = chance.natural();
            const records = [{ name: player.profile.name, uid: chance.guid(), rounds: [{ totalMultiplier }] }];

            beforeEach(() => {
                totalMultiplierRepository.find().lean().exec.mockReturnValueOnce(records);
                freeSpinConsumer.hasFreeSpin = jest.fn().mockReturnValue(false);
            });

            describe("when ingame has player info", () => {
                it("should reset total multiplier of play on ingame data", async () => {
                    // Arrange
                    const totalMultiplier = chance.natural();
                    gameData.ingame[player.profile.name] = { totalMultiplier };

                    // Act
                    await consumer.reload();

                    // Assert
                    expect(gameData.ingame[player.profile.name].totalMultiplier).toBe(0);
                });
            });

            it("should call totalMultiplier.updateOne", async () => {
                // Act
                await consumer.reload();

                // Assert
                expect(totalMultiplierRepository.updateOne).toBeCalledWith(
                    { uid: records[0].uid, ended: false },
                    { ended: true, endTime: new Date() }
                );
            });
        });
    });

    function stubPlayer() {
        const userInfo = UserInfo();
        const userSession = UserSession();
        userSession.operatorId = userSession.partnerId;
        userSession.playerId = userSession.memberId;
        userSession.playerName = userSession.memberName;

        return {
            UID: userInfo.UID,
            profile: userInfo,
            session: userSession,
        };
    }

    function stubGameData() {
        const data = new SlotGameData();

        data.remainingTime = 20;
        data.gameConfigs = {
            enabled: true,
            minbet: 1,
            maxbet: 1000,
            cascadingSlotsConfig: {
                multiplier: 20,
            },
        };
        data.freeSpinId = 1;

        return data;
    }
});
