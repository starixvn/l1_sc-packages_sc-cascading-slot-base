import ProcessBetQueue from "../process-bet-queue";
import { SlotGameData, EventConsumers } from "sc-slot-game-base";
import { FreeSpinConsumer, SettleGameRoundConsumer, TotalMultiplierConsumer } from "../../event-consumers";
import { stub, stubMongoose } from "jest-micro-auto-stub";
import { logger, helpers } from "sc-common";
import { UserInfo, UserSession } from "jest-auto-fixture/src/models";
import mongoose from "mongoose";
import Chance from "chance";
import { SlotNoticeHelper } from "sc-slot-game-base/src/helpers";

describe("processBetQueue", () => {
    jest.mock("sc-common");

    const chance = new Chance();
    const freeSpinsConsumer = stub(FreeSpinConsumer);
    const settleGameRoundConsumer = stub(SettleGameRoundConsumer);
    const placeBet = jest.fn();
    const roundsRepository = stubMongoose(mongoose.Model);
    const idCountersConsumer = stub(EventConsumers.IdCountersConsumer);
    const totalMultiplierConsumer = stub(TotalMultiplierConsumer);
    const placeBetPublisher = { publishGameFailedBet: jest.fn() };
    const gameData = stubGameData();
    const player = stubPlayer();
    const definition = { id: chance.natural() };
    const baseMetrics = {};

    let consumer;

    beforeEach(() => {
        jest.clearAllMocks();

        consumer = new ProcessBetQueue({
            definition,
            gameData,
            freeSpinsConsumer,
            settleGameRoundConsumer,
            placeBet,
            loggerService: logger,
            roundsRepository,
            idCountersConsumer,
            totalMultiplierConsumer,
            placeBetPublisher,
            baseMetrics,
        });
    });

    describe("proceed Bet", () => {
        describe("when player previous round has been not finished yet", () => {
            it("should call placeBetPublisher.publishGameFailedBet", async () => {
                // Arrange
                gameData.ingame[player.profile.name] = { finish: {} };

                // Act
                await consumer.proceedBet(player);

                // Assert
                expect(placeBetPublisher.publishGameFailedBet).toBeCalledWith(player.UID, {
                    endBet: -1,
                    notice: { errorCode: helpers.noticeHelper.cannotPlaceBet },
                });
            });
        });

        describe("when player previous round is finished", () => {
            const defaultPayload = {
                roundId: chance.natural(),
                betLevel: chance.natural({ min: 1, max: 50 }),
                coinValue: chance.floating({ min: 0.1, max: 20, fixed: 1 }),
            };

            beforeEach(() => {
                gameData.ingame[player.profile.name] = {};
                consumer.proceedOperatorBet = jest.fn();
            });

            it("should get soonestExpiredFreeSpinSet", async () => {
                // Act
                await consumer.proceedBet(player, defaultPayload);

                // Assert
                expect(freeSpinsConsumer.getSoonestExpiredFreeSpinSet).toBeCalledWith(player);
            });

            it("should call idCountersConsumer.consume", async () => {
                // Act
                await consumer.proceedBet(player, defaultPayload);

                // Assert
                expect(idCountersConsumer.consume).toBeCalledWith("round");
            });

            it("should call validateBetRequest", async () => {
                // Arrange
                consumer.validateBetRequest = jest.fn();

                // Act
                await consumer.proceedBet(player, defaultPayload);

                // Assert
                expect(consumer.validateBetRequest).toBeCalledWith(player, defaultPayload);
            });

            describe("when bet is freeSpin", () => {
                describe("when NOT having freeSpin", () => {
                    it("should call placeBetPublisher.publishGameFailedBet", async () => {
                        // Arrange
                        freeSpinsConsumer.getSoonestExpiredFreeSpinSet.mockReturnValueOnce(null);

                        // Act
                        await consumer.proceedBet(player, { freeSpin: true });

                        // Assert
                        expect(placeBetPublisher.publishGameFailedBet).toBeCalledWith(player.UID, {
                            endBet: -1,
                            notice: { errorCode: SlotNoticeHelper.invalidFreeSpin },
                        });
                    });
                });
            });

            describe("when having NO freeSpin", () => {
                describe("when having total multiplier", () => {
                    it("should call totalMultiplierConsumer.stopChain", async () => {
                        // Arrange
                        freeSpinsConsumer.getSoonestExpiredFreeSpinSet.mockReturnValueOnce(null);
                        totalMultiplierConsumer.getCurrentMultiplier.mockReturnValueOnce(chance.natural());

                        // Act
                        await consumer.proceedBet(player, defaultPayload);

                        // Assert
                        expect(totalMultiplierConsumer.stopChain).toBeCalledWith(player);
                    });
                });
            });

            describe("when bet is valid", () => {
                it("should call proceedOperatorBet", async () => {
                    // Arrange
                    consumer.validateBetRequest = jest.fn().mockResolvedValueOnce(true);

                    // Act
                    await consumer.proceedBet(player, defaultPayload);

                    // Assert
                    expect(consumer.proceedOperatorBet).toBeCalledWith(player, defaultPayload);
                });
            });
        });
    });

    describe("proceedOperatorBet", () => {
        const apiBetInfo = {
            amount: chance.natural(),
            gameId: definition.id,
            gameRoundId: chance.natural(),
            choiceId: chance.natural(),
            freeBet: chance.bool(),
            clientSentTime: new Date(),
        };

        const payload = {
            freeBet: chance.bool(),
            amount: chance.natural(),
            roundId: chance.natural(),
            receivedTime: new Date(),
            time: new Date(),
        };

        beforeEach(() => {
            jest.clearAllMocks();

            consumer.formatApiBetInfo = jest.fn().mockReturnValue({ ...apiBetInfo });
            consumer.proceedBetQueue = jest.fn();
            consumer.validateBetRequest = jest.fn();
            consumer.handleSuccessBet = jest.fn();
            consumer.handleFailedBet = jest.fn();
            baseMetrics.collectBetProcessedTime = jest.fn();
        });

        it("should call formatApiBetInfo", async () => {
            // Arrange
            placeBet.mockResolvedValueOnce({ isOk: true });

            // Act
            await consumer.proceedOperatorBet(player, payload);

            // Assert
            expect(consumer.formatApiBetInfo).toBeCalledWith(payload);
        });

        it("should call placeBet", async () => {
            // Arrange
            placeBet.mockReturnValueOnce({ isOk: true });

            // Act
            await consumer.proceedOperatorBet(player, payload);

            // Assert
            expect(consumer.placeBet).toBeCalledWith({ id: player.UID, session: player.session }, apiBetInfo);
        });

        it("should call collectBetProcessedTime", async () => {
            // Arrange
            const mockDate = new Date();
            placeBet.mockReturnValueOnce({ isOk: true, response: {} });
            jest.spyOn(global, "Date").mockImplementation(() => mockDate);
            spyOn(baseMetrics, "collectBetProcessedTime");

            // Act
            await consumer.proceedOperatorBet(player, payload);

            // Assert
            expect(baseMetrics.collectBetProcessedTime).toBeCalledWith((mockDate - payload.receivedTime) / 1000);
        });

        describe("when api result is Ok", () => {
            it("should call handleSuccessBet", async () => {
                // Arrange
                placeBet.mockReturnValueOnce({ isOk: true, response: {} });

                // Act
                await consumer.proceedOperatorBet(player, payload);

                // Assert
                expect(consumer.handleSuccessBet).toBeCalledWith(player, {}, apiBetInfo.gameRoundId, payload);
            });
        });

        describe("when api result is NOT Ok", () => {
            it("should call handleFailedBet", async () => {
                // Arrange
                placeBet.mockResolvedValueOnce({ isOk: false, response: {} });

                // Act
                await consumer.proceedOperatorBet(player, payload);

                // Assert
                expect(consumer.handleFailedBet).toBeCalled();
            });

            describe("when user stake level is NOT updated", () => {
                it("should NOT call updateUserStakeLevel", async () => {
                    // Arrange
                    jest.spyOn(consumer, "updateUserStakeLevel");
                    placeBet.mockResolvedValueOnce({
                        isOk: false,
                        response: {
                            apiError: {
                                minBet: player.profile.minBet,
                                maxBet: player.profile.maxBet,
                            },
                        },
                    });

                    // Act
                    await consumer.proceedOperatorBet(player, payload);

                    // Assert
                    expect(consumer.updateUserStakeLevel).not.toBeCalled();
                });
            });

            describe("when user stake level from API having maxBet is equal 0", () => {
                it("should NOT call updateUserStakeLevel", async () => {
                    // Arrange
                    jest.spyOn(consumer, "updateUserStakeLevel");
                    placeBet.mockResolvedValueOnce({
                        isOk: false,
                        response: {
                            apiError: {
                                minBet: player.profile.minBet + 10,
                                maxBet: 0,
                            },
                        },
                    });

                    // Act
                    await consumer.proceedOperatorBet(player, payload);

                    // Assert
                    expect(consumer.updateUserStakeLevel).not.toBeCalled();
                });
            });

            describe("when user stake level from API having minBet is equal 0", () => {
                it("should NOT call updateUserStakeLevel", async () => {
                    // Arrange
                    jest.spyOn(consumer, "updateUserStakeLevel");
                    placeBet.mockResolvedValueOnce({
                        isOk: false,
                        response: {
                            apiError: {
                                minBet: 0,
                                maxBet: player.profile.maxBet + 1000,
                            },
                        },
                    });

                    // Act
                    await consumer.proceedOperatorBet(player, payload);

                    // Assert
                    expect(consumer.updateUserStakeLevel).not.toBeCalled();
                });
            });

            describe("when user stake level is updated and maxBet, minBet is greater than 0", () => {
                it("should call updateUserStakeLevel", async () => {
                    // Arrange
                    const apiError = {
                        minBet: player.profile.minBet,
                        maxBet: player.profile.maxBet + 1000,
                    };
                    consumer.updateUserStakeLevel = jest.fn();
                    placeBet.mockResolvedValueOnce({
                        isOk: false,
                        response: {
                            apiError,
                        },
                    });

                    // Act
                    await consumer.proceedOperatorBet(player, payload);

                    // Assert
                    expect(consumer.updateUserStakeLevel).toBeCalledWith(player, apiError.minBet, apiError.maxBet);
                });
            });
        });
    });

    describe("upsertBet", () => {
        it("should call roundsRepository.create", async () => {
            // Arrange
            const roundId = chance.natural();
            const rate = chance.natural();
            const mockDate = new Date();
            const bet = {
                roundId: chance.natural(),
                betLevel: chance.natural({ min: 1, max: 50 }),
                coinValue: chance.floating({ min: 0.1, max: 20, fixed: 1 }),
                freeSpin: chance.bool(),
                bet: chance.natural(),
                betMultiplier: chance.natural(),
                totalAmount: chance.natural(),
            };
            jest.spyOn(global, "Date").mockReturnValueOnce(mockDate);

            // Act
            await consumer.upsertBet(player, roundId, bet, rate);

            // Assert
            expect(roundsRepository.create).toBeCalledWith({
                id: roundId,
                uid: player.UID,
                name: player.profile.name,
                freeBet: bet.freeBet,
                time: mockDate,
                freeSpin: bet.freeSpin,
                betLevel: bet.betLevel,
                coinValue: bet.coinValue,
                bet: bet.amount,
                betMultiplier: bet.betMultiplier,
                totalAmount: bet.totalAmount,
                rate: rate,
                exchangeRateId: gameData.exchangeRates.exId,
                odds: {
                    oddsByCounts: gameData.gameConfigs.slotsConfig.oddsByCounts,
                    freeSpins: gameData.gameConfigs.slotsConfig.freeSpins,
                },
                memberId: player.session.memberId,
                playerId: player.session.memberId,
                siteId: player.session.siteId,
                currency: player.session.currencyName,
                partnerId: player.session.partnerId,
                operatorId: player.session.partnerId,
            });
        });
    });

    function stubGameData() {
        const data = new SlotGameData();

        data.remainingTime = 20;
        data.gameConfigs = {
            enabled: true,
            minbet: 1,
            maxbet: 1000,
            slotsConfig: {
                betMultiplier: 20,
                oddsByCounts: {},
                freeSpins: {},
            },
        };
        data.exchangeRates = { exId: chance.string() };
        data.freeSpinId = 1;

        return data;
    }

    function stubPlayer() {
        const userInfo = UserInfo();
        const userSession = UserSession();

        return {
            UID: userInfo.UID,
            profile: userInfo,
            session: userSession,
        };
    }
});
