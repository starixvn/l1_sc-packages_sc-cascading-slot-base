import Chance from "chance";
import { UserInfo, UserSession } from "jest-auto-fixture/src/models";
import { stub, stubMongoose } from "jest-micro-auto-stub";
import mongoose from "mongoose";
import { helpers, logger } from "sc-common";
import { EventConsumers, SlotGameData } from "sc-slot-game-base";
import { FreeSpinConsumer, SettleGameRoundConsumer, TotalMultiplierConsumer } from "../../event-consumers";
import CascadingProcessBetQueue from "../cascading-process-bet-queue";

describe("cascadingProcessBetQueue", () => {
    jest.mock("sc-common");

    const chance = new Chance();
    const freeSpinsConsumer = stub(FreeSpinConsumer);
    /**
     * @type {SettleGameRoundConsumer}
     */
    const settleGameRoundConsumer = stub(SettleGameRoundConsumer);
    const totalMultiplierConsumer = stub(TotalMultiplierConsumer);
    const placeBet = jest.fn();
    const roundsRepository = stubMongoose(mongoose.Model);
    const idCountersConsumer = stub(EventConsumers.IdCountersConsumer);
    const placeBetPublisher = { publishGameFailedBet: jest.fn() };
    const gameData = stubGameData();
    const player = stubPlayer();
    const definition = { id: chance.natural() };
    const baseMetrics = {};

    /**
     * @type {CascadingProcessBetQueue}
     */
    let consumer;

    beforeEach(() => {
        jest.clearAllMocks();

        consumer = new CascadingProcessBetQueue({
            definition,
            gameData,
            freeSpinsConsumer,
            settleGameRoundConsumer,
            placeBet,
            loggerService: logger,
            roundsRepository,
            idCountersConsumer,
            placeBetPublisher,
            baseMetrics,
            totalMultiplierConsumer,
        });
    });

    describe("proceedBet", () => {
        describe("when payload has buyFreeSpin and player has free spins", () => {
            it("should publish failed bet event", async () => {
                // Arrange
                const payload = { buyFreeSpin: true };
                freeSpinsConsumer.hasFreeSpin.mockReturnValueOnce(true);

                // Act
                await consumer.proceedBet(player, payload);

                // Assert
                expect(placeBetPublisher.publishGameFailedBet).toBeCalledWith(player.UID, {
                    endBet: -1,
                    notice: { errorCode: helpers.noticeHelper.cannotPlaceBet },
                });
            });
        });

        describe("when payload has buyFreeSpin but player has no free spins", () => {
            it("should call super.proceedBet", async () => {
                // Arrange
                const payload = { buyFreeSpin: true };
                freeSpinsConsumer.hasFreeSpin.mockReturnValueOnce(false);
                const superProceedBetSpy = jest.spyOn(consumer, "proceedBet").mockImplementation(() => {});

                // Act
                await consumer.proceedBet(player, payload);

                // Assert
                expect(superProceedBetSpy).toBeCalledWith(player, payload);
            });
        });

        describe("when payload does not have buyFreeSpin", () => {
            it("should call super.proceedBet", async () => {
                // Arrange
                const payload = { buyFreeSpin: false };
                const superProceedBetSpy = jest.spyOn(consumer, "proceedBet").mockImplementation(() => {});

                // Act
                await consumer.proceedBet(player, payload);

                // Assert
                expect(superProceedBetSpy).toBeCalledWith(player, payload);
            });
        });
    });

    describe("generateBetInfo", () => {
        describe("when bet is free spin", () => {
            it("should update bet info follow freeSpin info", async () => {
                // Arrange
                const payload = { freeBet: true };
                const freeSpinInfo = { betLevel: chance.natural(), coinValue: chance.natural(), betMultiplier: chance.natural() };

                // Act
                const actualResult = await consumer.generateBetInfo(payload, freeSpinInfo);

                // Assert
                expect(actualResult).toStrictEqual({
                    freeBet: true,
                    ...freeSpinInfo,
                    amount: freeSpinInfo.betLevel * freeSpinInfo.coinValue,
                    totalAmount: freeSpinInfo.betLevel * freeSpinInfo.coinValue * freeSpinInfo.betMultiplier,
                    contributionAmount: 0,
                    contributionRate: 0,
                });
            });
        });

        describe("when bet is NOT free spin", () => {
            const payload = { freeBet: false, betLevel: chance.natural(), coinValue: chance.natural() };

            it("should return correct bet info", async () => {
                // Act
                const actualResult = await consumer.generateBetInfo(payload, undefined, player);

                // Assert
                expect(actualResult).toStrictEqual({
                    ...payload,
                    betMultiplier: gameData.gameConfigs.cascadingSlotsConfig.betMultiplier,
                    amount: payload.betLevel * payload.coinValue,
                    totalAmount: payload.betLevel * payload.coinValue * gameData.gameConfigs.cascadingSlotsConfig.betMultiplier,
                    contributionAmount: 0,
                    contributionRate: 0,
                });
            });
        });

        describe("when bet has buyFreeSpin", () => {
            const payload = {
                freeBet: false,
                betLevel: 10,
                coinValue: 2,
                buyFreeSpin: true,
            };

            it("should apply buy free spin multiplier when enabled", async () => {
                // Arrange
                gameData.gameConfigs.cascadingSlotsConfig.features = {
                    buyFreeSpins: { multiplier: 2, enabled: true },
                };

                // Act
                const actualResult = await consumer.generateBetInfo(payload, undefined, player);

                // Assert
                expect(actualResult.totalAmount).toBe(10 * 2 * 20 * 2); // betLevel * coinValue * betMultiplier * buyFreeSpinMultiplier
                expect(actualResult.contributionAmount).toBe(0 * 2); // contributionRate * totalAmount * buyFreeSpinMultiplier
            });

            it("should not apply multiplier when buy free spin is disabled", async () => {
                // Arrange
                gameData.gameConfigs.cascadingSlotsConfig.features = {
                    buyFreeSpins: { multiplier: 2, enabled: false },
                };

                // Act
                const actualResult = await consumer.generateBetInfo(payload, undefined, player);

                // Assert
                expect(actualResult.totalAmount).toBe(10 * 2 * 20 * 1); // betLevel * coinValue * betMultiplier * 1
                expect(actualResult.contributionAmount).toBe(0); // contributionRate * totalAmount * 1
            });

            it("should not apply multiplier when site is excluded", async () => {
                // Arrange
                gameData.gameConfigs.cascadingSlotsConfig.features = {
                    buyFreeSpins: {
                        multiplier: 2,
                        enabled: true,
                        siteExclusions: [
                            {
                                operatorId: player.session.operatorId,
                                sites: [player.session.siteName],
                            },
                        ],
                    },
                };

                // Act
                const actualResult = await consumer.generateBetInfo(payload, undefined, player);

                // Assert
                expect(actualResult.totalAmount).toBe(10 * 2 * 20 * 1); // betLevel * coinValue * betMultiplier * 1
                expect(actualResult.contributionAmount).toBe(0); // contributionRate * totalAmount * 1
            });

            it("should apply multiplier when site is not in exclusion list", async () => {
                // Arrange
                gameData.gameConfigs.cascadingSlotsConfig.features = {
                    buyFreeSpins: {
                        multiplier: 2,
                        enabled: true,
                        siteExclusions: [
                            {
                                operatorId: player.session.operatorId,
                                sites: ["different-site"],
                            },
                        ],
                    },
                };

                // Act
                const actualResult = await consumer.generateBetInfo(payload, undefined, player);

                // Assert
                expect(actualResult.totalAmount).toBe(10 * 2 * 20 * 2); // betLevel * coinValue * betMultiplier * buyFreeSpinMultiplier
                expect(actualResult.contributionAmount).toBe(0 * 2); // contributionRate * totalAmount * buyFreeSpinMultiplier
            });
        });

        describe("when jackpot is configured", () => {
            it("should include contribution rate and amount", async () => {
                // Arrange
                const payload = { freeBet: false, betLevel: 10, coinValue: 2 };
                gameData.gameConfigs.cascadingSlotsConfig.jackpot = {
                    playerContributionRatio: 0.05,
                };

                // Act
                const actualResult = await consumer.generateBetInfo(payload, undefined, player);

                // Assert
                expect(actualResult.contributionRate).toBe(0.05);
                expect(actualResult.contributionAmount).toBe(0.05 * actualResult.totalAmount);
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
                buyFreeSpin: bet.buyFreeSpin,
                rate: rate,
                exchangeRateId: gameData.exchangeRates.exId,
                buyFreeSpinRefRoundId: undefined,
                odds: {
                    oddsByCounts: gameData.gameConfigs.cascadingSlotsConfig.oddsByCounts,
                    freeSpins: gameData.gameConfigs.cascadingSlotsConfig.freeSpins,
                },
                siteId: player.session.siteId,
                currency: player.session.currencyName,
                currencyCode: player.session.currencyCode,
                currencyGroupId: player.session.currencyGroupId,
                operatorId: player.session.operatorId,
                playerId: player.session.playerId,
            });
        });
    });

    describe("handleSuccessBet", () => {
        const balance = chance.natural();
        const roundId = chance.natural();
        const bet = {};
        const rate = chance.natural();

        beforeEach(() => {
            consumer.calculateCurrencyRate = jest.fn().mockReturnValueOnce(rate);
            consumer.upsertBet = jest.fn();
            consumer.notifyPlacingBetResult = jest.fn();
        });

        describe("when bet is using freeSpin", () => {
            const freeSpinBet = { freeSpin: true };

            it("should call freeSpinsConsumer.userFreeSpin", async () => {
                // Arrange
                const mockFreeSpin = { buyFreeSpinRefRoundId: chance.natural() };
                freeSpinsConsumer.useFreeSpin.mockResolvedValueOnce(mockFreeSpin);

                // Act
                await consumer.handleSuccessBet(player, balance, roundId, freeSpinBet);

                // Assert
                expect(freeSpinsConsumer.useFreeSpin).toBeCalledWith(player);
            });
        });

        it("should call calculateCurrencyRate", async () => {
            // Act
            await consumer.handleSuccessBet(player, balance, roundId, bet);

            // Assert
            expect(consumer.calculateCurrencyRate).toBeCalledWith(player.session);
        });

        it("should call upsertBet", async () => {
            // Act
            await consumer.handleSuccessBet(player, balance, roundId, bet);

            // Assert
            expect(consumer.upsertBet).toBeCalledWith(player, roundId, bet, rate, null);
        });

        it("should call notifyPlacingBetResult", async () => {
            // Act
            await consumer.handleSuccessBet(player, balance, roundId, bet);

            // Assert
            expect(consumer.notifyPlacingBetResult).toBeCalledWith(player, balance, bet, rate);
        });

        it("should call settleGameRoundConsumer.settleRound", async () => {
            // Act
            await consumer.handleSuccessBet(player, balance, roundId, bet);

            // Assert
            expect(settleGameRoundConsumer.settleRound).toBeCalledWith(player, roundId);
        });
    });

    function stubGameData() {
        const data = new SlotGameData();

        data.remainingTime = 20;
        data.gameConfigs = {
            enabled: true,
            minbet: 1,
            maxbet: 1000,
            cascadingSlotsConfig: {
                betMultiplier: 20,
                oddsByCounts: {},
                freeSpins: {},
            },
        };
        data.exchangeRates = { exId: chance.string() };
        data.freeSpinId = 1;
        data.betMultiplier = 20;

        return data;
    }

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
});
