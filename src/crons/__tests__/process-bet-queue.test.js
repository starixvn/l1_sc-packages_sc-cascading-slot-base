import Chance from "chance";
import { UserInfo, UserSession } from "jest-auto-fixture/src/models";
import { stub, stubMongoose } from "jest-micro-auto-stub";
import mongoose from "mongoose";
import { logger } from "sc-common";
import GameManagementApiClientFactory from "sc-game-base/src/core/game-management-api";
import { EventConsumers, SlotGameData } from "sc-slot-game-base";
import { FreeSpinConsumer, SettleGameRoundConsumer, TotalMultiplierConsumer } from "../../event-consumers";
import CascadingProcessBetQueue from "../cascading-process-bet-queue";

describe("cascadingProcessBetQueue", () => {
    jest.mock("sc-common");

    const chance = new Chance();
    const freeSpinsConsumer = stub(FreeSpinConsumer);
    const settleGameRoundConsumer = stub(SettleGameRoundConsumer);
    const totalMultiplierConsumer = stub(TotalMultiplierConsumer);
    const placeBet = jest.fn();
    const roundsRepository = stubMongoose(mongoose.Model);
    const betsRepository = stubMongoose(mongoose.Model);
    const betLogsRepository = stubMongoose(mongoose.Model);
    const idCountersConsumer = stub(EventConsumers.IdCountersConsumer);
    const placeBetPublisher = { publishGameFailedBet: jest.fn() };
    const gameManagementApiClientFactory = stub(GameManagementApiClientFactory);
    const gameData = stubGameData();
    const player = stubPlayer();
    const definition = { id: chance.natural() };
    const baseMetrics = {};

    let consumer;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock the gameManagementApiClientFactory.instance() method
        gameManagementApiClientFactory.instance.mockReturnValue({
            users: {
                updateBalance: jest.fn(() => Promise.resolve({ isOk: true })),
            },
        });

        // Mock the freeSpinsConsumer.useFreeSpin method
        freeSpinsConsumer.useFreeSpin.mockReturnValue({
            buyFreeSpinRefRoundId: chance.natural(),
        });

        // Mock the settleGameRoundConsumer.settleRound method
        settleGameRoundConsumer.settleRound.mockReturnValue({
            betwin: chance.natural(),
        });

        consumer = new CascadingProcessBetQueue({
            definition,
            gameData,
            freeSpinsConsumer,
            settleGameRoundConsumer,
            placeBet,
            logService: logger,
            roundsRepository,
            betsRepository,
            betLogsRepository,
            idCountersConsumer,
            placeBetPublisher,
            baseMetrics,
            totalMultiplierConsumer,
            gameManagementApiClientFactory,
            betEventInterceptors: [],
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
                    roundId: gameData.roundId,
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
                    roundId: gameData.roundId,
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
                appType: player.session.system,
                siteName: player.session.siteName,
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
            consumer.executeInterceptorEvent = jest.fn();
        });

        describe("when bet is using freeSpin", () => {
            const freeSpinBet = { freeSpin: true };

            it("should call freeSpinsConsumer.userFreeSpin", async () => {
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
            expect(consumer.upsertBet).toBeCalledWith(player, roundId, bet, rate, undefined, null);
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

        describe("when interceptors are provided", () => {
            it("should call executeInterceptorEvent with betLevel and coinValue", async () => {
                // Arrange
                const betwin = 150;
                const betWithLevels = {
                    betLevel: 5,
                    coinValue: 0.25,
                    totalAmount: 25,
                    freeSpin: false,
                };
                const mockInterceptors = ["interceptor1", "interceptor2"];

                settleGameRoundConsumer.settleRound.mockResolvedValueOnce({ betwin });

                // Act
                await consumer.handleSuccessBet(player, balance, roundId, betWithLevels, mockInterceptors);

                // Assert
                expect(consumer.executeInterceptorEvent).toBeCalledWith("afterSuccessEvent", mockInterceptors, {
                    player,
                    bet: {
                        roundId,
                        betWin: betwin,
                        amount: betWithLevels.totalAmount,
                        betLevel: betWithLevels.betLevel,
                        coinValue: betWithLevels.coinValue,
                        baseBetWin: betwin * rate,
                    },
                    balance,
                });
            });

            it("should not call executeInterceptorEvent when no interceptors provided", async () => {
                // Arrange
                settleGameRoundConsumer.settleRound.mockResolvedValueOnce({ betwin: 100 });

                // Act
                await consumer.handleSuccessBet(player, balance, roundId, bet, null);

                // Assert
                expect(consumer.executeInterceptorEvent).not.toBeCalled();
            });

            it("should call executeInterceptorEvent even with empty interceptors array", async () => {
                // Arrange
                settleGameRoundConsumer.settleRound.mockResolvedValueOnce({ betwin: 100 });

                // Act
                await consumer.handleSuccessBet(player, balance, roundId, bet, []);

                // Assert
                expect(consumer.executeInterceptorEvent).toBeCalledWith("afterSuccessEvent", [], {
                    player,
                    bet: {
                        roundId,
                        betWin: 100,
                        amount: bet.totalAmount,
                        betLevel: bet.betLevel,
                        coinValue: bet.coinValue,
                        baseBetWin: 100 * rate,
                    },
                    balance,
                });
            });
        });
    });

    class ProcessBetQueueTestFactory {
        static createPlayer(overrides = {}) {
            // Create player without relying on jest-auto-fixture to avoid date issues
            return {
                UID: chance.guid(),
                profile: {
                    name: chance.name(),
                    ...overrides.profile,
                },
                session: {
                    siteId: chance.natural(),
                    currencyName: "USD",
                    currencyCode: "USD",
                    currencyGroupId: 1,
                    operatorId: chance.natural(),
                    playerId: chance.natural(),
                    system: "web",
                    siteName: "TestSite",
                    ...overrides.session,
                },
                promotion: {
                    promotionId: "promo123",
                    remainingBonusItems: 5,
                    initialBonusItem: 10,
                    freeSpinAvailable: 0,
                    ...overrides.promotion,
                },
                ...overrides,
            };
        }

        static createGameDataWithFeatures(overrides = {}) {
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
                    jackpot: {
                        playerContributionRatio: 0.05,
                    },
                    features: {
                        buyFreeSpins: {
                            enabled: true,
                            multiplier: 100,
                        },
                    },
                    ...overrides.cascadingSlotsConfig,
                },
            };
            data.exchangeRates = { exId: chance.string() };
            data.freeSpinId = 1;
            data.betMultiplier = 20;
            return { ...data, ...overrides };
        }

        static createPayload(overrides = {}) {
            return {
                betLevel: 1,
                coinValue: 0.25,
                totalAmount: 5,
                buyFreeSpin: false,
                ...overrides,
            };
        }

        static createBetInfo(overrides = {}) {
            return {
                betLevel: 1,
                coinValue: 0.25,
                betMultiplier: 20,
                totalAmount: 5,
                freeBet: false,
                freeSpin: false,
                buyFreeSpin: false,
                ...overrides,
            };
        }

        static createMockConsumer(gameDataOverrides = {}) {
            const mockGameData = ProcessBetQueueTestFactory.createGameDataWithFeatures(gameDataOverrides);
            
            return new CascadingProcessBetQueue({
                definition: { id: chance.natural() },
                gameData: mockGameData,
                freeSpinsConsumer,
                settleGameRoundConsumer,
                placeBet,
                logService: logger,
                roundsRepository,
                betsRepository,
                betLogsRepository,
                idCountersConsumer,
                placeBetPublisher,
                baseMetrics: {},
                totalMultiplierConsumer,
                gameManagementApiClientFactory,
                betEventInterceptors: [],
            });
        }
    }

    describe("CascadingProcessBetQueue - Enhanced Coverage", () => {
        let enhancedConsumer;
        let mockPlayer;
        let mockGameData;

        beforeEach(() => {
            jest.clearAllMocks();
            mockGameData = ProcessBetQueueTestFactory.createGameDataWithFeatures();
            mockPlayer = ProcessBetQueueTestFactory.createPlayer();
            enhancedConsumer = ProcessBetQueueTestFactory.createMockConsumer();
            
            // Setup common mocks
            freeSpinsConsumer.hasFreeSpin.mockReturnValue(false);
            enhancedConsumer.hasValidPromotion = jest.fn().mockReturnValue(true);
        });

        describe("isValidBuyFreeSpin", () => {
            describe("when buy free spins feature is enabled", () => {
                it("should return true when all conditions are met", () => {
                    // Arrange
                    const playerWithSession = ProcessBetQueueTestFactory.createPlayer();
                    enhancedConsumer.hasValidPromotion.mockReturnValue(false);

                    // Act
                    const result = enhancedConsumer.isValidBuyFreeSpin(playerWithSession);

                    // Assert
                    expect(result).toBe(true);
                });

                it("should return false when player has active free spin", () => {
                    // Arrange
                    const playerWithFreeSpin = ProcessBetQueueTestFactory.createPlayer();
                    freeSpinsConsumer.hasFreeSpin.mockReturnValue(true);

                    // Act
                    const result = enhancedConsumer.isValidBuyFreeSpin(playerWithFreeSpin);

                    // Assert
                    expect(result).toBe(false);
                });

                it("should return false when player is in promotion period", () => {
                    // Arrange
                    const playerInPromotion = ProcessBetQueueTestFactory.createPlayer({
                        promotion: {
                            remainingBonusItems: 3,
                            initialBonusItem: 10,
                            freeSpinAvailable: 0,
                        },
                    });
                    enhancedConsumer.isInPromotionPeriod = jest.fn().mockReturnValue(true);

                    // Act
                    const result = enhancedConsumer.isValidBuyFreeSpin(playerInPromotion);

                    // Assert
                    expect(result).toBe(false);
                });
            });

            describe("when buy free spins feature is disabled", () => {
                it("should return false when feature is disabled", () => {
                    // Arrange
                    const disabledConsumer = ProcessBetQueueTestFactory.createMockConsumer({
                        cascadingSlotsConfig: {
                            features: {
                                buyFreeSpins: {
                                    enabled: false,
                                },
                            },
                        },
                    });
                    const playerWithSession = ProcessBetQueueTestFactory.createPlayer();

                    // Act
                    const result = disabledConsumer.isValidBuyFreeSpin(playerWithSession);

                    // Assert
                    expect(result).toBe(false);
                });

                it("should return undefined when features object is undefined", () => {
                    // Arrange
                    const noFeaturesConsumer = ProcessBetQueueTestFactory.createMockConsumer({
                        cascadingSlotsConfig: {
                            features: undefined,
                        },
                    });
                    const playerWithSession = ProcessBetQueueTestFactory.createPlayer();

                    // Act
                    const result = noFeaturesConsumer.isValidBuyFreeSpin(playerWithSession);

                    // Assert - Returns undefined because features?.buyFreeSpins is undefined
                    expect(result).toBeUndefined();
                });
            });
        });

        describe("isInPromotionPeriod", () => {
            describe("when player has valid promotion", () => {
                it("should return true when bonus items are partially consumed", () => {
                    // Arrange
                    const playerWithPartialBonus = ProcessBetQueueTestFactory.createPlayer({
                        promotion: {
                            remainingBonusItems: 3,
                            initialBonusItem: 10,
                            freeSpinAvailable: 0,
                        },
                    });

                    // Act
                    const result = enhancedConsumer.isInPromotionPeriod(playerWithPartialBonus);

                    // Assert
                    expect(result).toBe(true);
                });

                it("should return true when no bonus items remain but free spins available", () => {
                    // Arrange
                    const playerWithFreeSpins = ProcessBetQueueTestFactory.createPlayer({
                        promotion: {
                            remainingBonusItems: 0,
                            initialBonusItem: 10,
                            freeSpinAvailable: 2,
                        },
                    });

                    // Act
                    const result = enhancedConsumer.isInPromotionPeriod(playerWithFreeSpins);

                    // Assert
                    expect(result).toBe(true);
                });

                it("should return false when no bonus items and no free spins remain", () => {
                    // Arrange
                    const playerWithNoBonus = ProcessBetQueueTestFactory.createPlayer({
                        promotion: {
                            remainingBonusItems: 0,
                            initialBonusItem: 10,
                            freeSpinAvailable: 0,
                        },
                    });

                    // Act
                    const result = enhancedConsumer.isInPromotionPeriod(playerWithNoBonus);

                    // Assert
                    expect(result).toBe(false);
                });

                it("should return false when all bonus items remain unused", () => {
                    // Arrange
                    const playerWithFullBonus = ProcessBetQueueTestFactory.createPlayer({
                        promotion: {
                            remainingBonusItems: 10,
                            initialBonusItem: 10,
                            freeSpinAvailable: 0,
                        },
                    });

                    // Act
                    const result = enhancedConsumer.isInPromotionPeriod(playerWithFullBonus);

                    // Assert
                    expect(result).toBe(false);
                });
            });

            describe("when player has no valid promotion", () => {
                it("should return false when promotion is invalid", () => {
                    // Arrange
                    const playerWithoutPromotion = ProcessBetQueueTestFactory.createPlayer();
                    enhancedConsumer.hasValidPromotion.mockReturnValue(false);

                    // Act
                    const result = enhancedConsumer.isInPromotionPeriod(playerWithoutPromotion);

                    // Assert
                    expect(result).toBe(false);
                });
            });
        });

        describe("proceedBet", () => {
            beforeEach(() => {
                enhancedConsumer.isValidBuyFreeSpin = jest.fn();
                jest.spyOn(CascadingProcessBetQueue.prototype.__proto__, 'proceedBet').mockImplementation(() => Promise.resolve());
            });

            describe("when buyFreeSpin is requested", () => {
                it("should proceed when buy free spin is valid", async () => {
                    // Arrange
                    const payload = ProcessBetQueueTestFactory.createPayload({ buyFreeSpin: true });
                    const validPlayer = ProcessBetQueueTestFactory.createPlayer();
                    enhancedConsumer.isValidBuyFreeSpin.mockReturnValue(true);

                    // Act
                    await enhancedConsumer.proceedBet(validPlayer, payload);

                    // Assert
                    expect(CascadingProcessBetQueue.prototype.__proto__.proceedBet).toHaveBeenCalledWith(validPlayer, payload);
                });

                it("should publish failed bet when buy free spin is invalid", async () => {
                    // Arrange
                    const payload = ProcessBetQueueTestFactory.createPayload({ buyFreeSpin: true });
                    const invalidPlayer = ProcessBetQueueTestFactory.createPlayer();
                    enhancedConsumer.isValidBuyFreeSpin.mockReturnValue(false);

                    // Act
                    await enhancedConsumer.proceedBet(invalidPlayer, payload);

                    // Assert
                    expect(placeBetPublisher.publishGameFailedBet).toHaveBeenCalledWith(
                        invalidPlayer.UID,
                        expect.objectContaining({
                            endBet: -1,
                            notice: expect.objectContaining({
                                errorCode: expect.any(String),
                            }),
                        })
                    );
                });

                it("should not call super.proceedBet when buy free spin is invalid", async () => {
                    // Arrange
                    const payload = ProcessBetQueueTestFactory.createPayload({ buyFreeSpin: true });
                    const invalidPlayer = ProcessBetQueueTestFactory.createPlayer();
                    enhancedConsumer.isValidBuyFreeSpin.mockReturnValue(false);

                    // Act
                    await enhancedConsumer.proceedBet(invalidPlayer, payload);

                    // Assert
                    expect(CascadingProcessBetQueue.prototype.__proto__.proceedBet).not.toHaveBeenCalled();
                });
            });

            describe("when buyFreeSpin is not requested", () => {
                it("should proceed normally without buy free spin validation", async () => {
                    // Arrange
                    const payload = ProcessBetQueueTestFactory.createPayload({ buyFreeSpin: false });
                    const normalPlayer = ProcessBetQueueTestFactory.createPlayer();

                    // Act
                    await enhancedConsumer.proceedBet(normalPlayer, payload);

                    // Assert
                    expect(CascadingProcessBetQueue.prototype.__proto__.proceedBet).toHaveBeenCalledWith(normalPlayer, payload);
                });

                it("should not validate buy free spin when not requested", async () => {
                    // Arrange
                    const payload = ProcessBetQueueTestFactory.createPayload({ buyFreeSpin: false });
                    const normalPlayer = ProcessBetQueueTestFactory.createPlayer();

                    // Act
                    await enhancedConsumer.proceedBet(normalPlayer, payload);

                    // Assert
                    expect(enhancedConsumer.isValidBuyFreeSpin).not.toHaveBeenCalled();
                });
            });
        });

        describe("generateBetInfo - Buy Free Spin Enhancement", () => {
            describe("when buyFreeSpin is true", () => {
                it("should apply buy free spin multiplier to total amount", async () => {
                    // Arrange
                    const payload = ProcessBetQueueTestFactory.createPayload({
                        betLevel: 2,
                        coinValue: 0.5,
                        buyFreeSpin: true,
                    });
                    const playerWithSession = ProcessBetQueueTestFactory.createPlayer();

                    // Act
                    const result = await enhancedConsumer.generateBetInfo(payload, null, playerWithSession);

                    // Assert
                    expect(result.totalAmount).toBe(2000); // 2 * 0.5 * 20 * 100
                });

                it("should apply buy free spin multiplier to contribution amount", async () => {
                    // Arrange
                    const payload = ProcessBetQueueTestFactory.createPayload({
                        betLevel: 1,
                        coinValue: 0.25,
                        buyFreeSpin: true,
                    });
                    const playerWithSession = ProcessBetQueueTestFactory.createPlayer();

                    // Act
                    const result = await enhancedConsumer.generateBetInfo(payload, null, playerWithSession);

                    // Assert
                    // contributionRate * totalAmount * buyFreeSpinMultiplier
                    // 0.05 * (1 * 0.25 * 20 * 100) * 100 = 0.05 * 500 * 100 = 2500
                    expect(result.contributionAmount).toBe(2500);
                });

                it("should preserve buy free spin flag in result", async () => {
                    // Arrange
                    const payload = ProcessBetQueueTestFactory.createPayload({ buyFreeSpin: true });
                    const playerWithSession = ProcessBetQueueTestFactory.createPlayer();

                    // Act
                    const result = await enhancedConsumer.generateBetInfo(payload, null, playerWithSession);

                    // Assert
                    expect(result.buyFreeSpin).toBe(true);
                });
            });

            describe("when buyFreeSpin is false", () => {
                it("should not apply buy free spin multiplier", async () => {
                    // Arrange
                    const payload = ProcessBetQueueTestFactory.createPayload({
                        betLevel: 2,
                        coinValue: 0.5,
                        buyFreeSpin: false,
                    });
                    const playerWithSession = ProcessBetQueueTestFactory.createPlayer();

                    // Act
                    const result = await enhancedConsumer.generateBetInfo(payload, null, playerWithSession);

                    // Assert
                    expect(result.totalAmount).toBe(20); // 2 * 0.5 * 20 (no 100x multiplier)
                });
            });

            describe("when features object is missing", () => {
                it("should handle undefined features gracefully", async () => {
                    // Arrange
                    const consumerWithoutFeatures = ProcessBetQueueTestFactory.createMockConsumer({
                        cascadingSlotsConfig: {
                            features: undefined,
                        },
                    });
                    const payload = ProcessBetQueueTestFactory.createPayload({ buyFreeSpin: true });
                    const playerWithSession = ProcessBetQueueTestFactory.createPlayer();

                    // Act & Assert
                    await expect(consumerWithoutFeatures.generateBetInfo(payload, null, playerWithSession))
                        .rejects.toThrow();
                });
            });
        });

        describe("upsertBet - Interceptor Enhancement", () => {
            let mockInterceptors;
            let mockTransformedBet;

            beforeEach(() => {
                mockInterceptors = [{ name: "testInterceptor" }];
                mockTransformedBet = { transformedProperty: "testValue" };
                enhancedConsumer.executeInterceptorTransform = jest.fn().mockReturnValue(mockTransformedBet);
            });

            describe("when interceptors are provided", () => {
                it("should call executeInterceptorTransform with correct parameters", async () => {
                    // Arrange
                    const roundId = chance.natural();
                    const betInfo = ProcessBetQueueTestFactory.createBetInfo();
                    const rate = 1.5;
                    const buyFreeSpinRefRoundId = chance.natural();
                    const playerWithSession = ProcessBetQueueTestFactory.createPlayer();

                    // Act
                    await enhancedConsumer.upsertBet(playerWithSession, roundId, betInfo, rate, mockInterceptors, buyFreeSpinRefRoundId);

                    // Assert
                    expect(enhancedConsumer.executeInterceptorTransform).toHaveBeenCalledWith(
                        "enhanceBetRecord",
                        mockInterceptors,
                        expect.objectContaining({
                            betRecord: expect.any(Object),
                            bet: betInfo,
                        })
                    );
                });

                it("should use transformed bet record for database insertion", async () => {
                    // Arrange
                    const roundId = chance.natural();
                    const betInfo = ProcessBetQueueTestFactory.createBetInfo();
                    const rate = 1.5;
                    const playerWithSession = ProcessBetQueueTestFactory.createPlayer();
                    const transformedResult = { ...mockTransformedBet, id: roundId };
                    enhancedConsumer.executeInterceptorTransform.mockReturnValue(transformedResult);

                    // Act
                    await enhancedConsumer.upsertBet(playerWithSession, roundId, betInfo, rate, mockInterceptors);

                    // Assert
                    expect(roundsRepository.create).toHaveBeenCalledWith(transformedResult);
                });

                it("should preserve base bet record structure when transforming", async () => {
                    // Arrange
                    const roundId = chance.natural();
                    const betInfo = ProcessBetQueueTestFactory.createBetInfo();
                    const rate = 1.5;
                    const playerWithSession = ProcessBetQueueTestFactory.createPlayer();

                    // Act
                    await enhancedConsumer.upsertBet(playerWithSession, roundId, betInfo, rate, mockInterceptors);

                    // Assert
                    const transformCall = enhancedConsumer.executeInterceptorTransform.mock.calls[0];
                    const betRecord = transformCall[2].betRecord;
                    expect(betRecord).toEqual(expect.objectContaining({
                        id: roundId,
                        uid: playerWithSession.UID,
                        name: playerWithSession.profile.name,
                        betLevel: betInfo.betLevel,
                        coinValue: betInfo.coinValue,
                    }));
                });
            });

            describe("when no interceptors are provided", () => {
                it("should not call executeInterceptorTransform", async () => {
                    // Arrange
                    const roundId = chance.natural();
                    const betInfo = ProcessBetQueueTestFactory.createBetInfo();
                    const rate = 1.5;
                    const playerWithSession = ProcessBetQueueTestFactory.createPlayer();

                    // Act
                    await enhancedConsumer.upsertBet(playerWithSession, roundId, betInfo, rate, null);

                    // Assert
                    expect(enhancedConsumer.executeInterceptorTransform).not.toHaveBeenCalled();
                });

                it("should use original bet record for database insertion", async () => {
                    // Arrange
                    const roundId = chance.natural();
                    const betInfo = ProcessBetQueueTestFactory.createBetInfo();
                    const rate = 1.5;
                    const playerWithSession = ProcessBetQueueTestFactory.createPlayer();

                    // Act
                    await enhancedConsumer.upsertBet(playerWithSession, roundId, betInfo, rate, null);

                    // Assert
                    expect(roundsRepository.create).toHaveBeenCalledWith(
                        expect.objectContaining({
                            id: roundId,
                            uid: playerWithSession.UID,
                            name: playerWithSession.profile.name,
                        })
                    );
                });
            });

            describe("when interceptors array is empty", () => {
                it("should still call executeInterceptorTransform", async () => {
                    // Arrange
                    const roundId = chance.natural();
                    const betInfo = ProcessBetQueueTestFactory.createBetInfo();
                    const rate = 1.5;
                    const playerWithSession = ProcessBetQueueTestFactory.createPlayer();
                    const emptyInterceptors = [];

                    // Act
                    await enhancedConsumer.upsertBet(playerWithSession, roundId, betInfo, rate, emptyInterceptors);

                    // Assert
                    expect(enhancedConsumer.executeInterceptorTransform).toHaveBeenCalledWith(
                        "enhanceBetRecord",
                        emptyInterceptors,
                        expect.any(Object)
                    );
                });
            });
        });

        describe("Integration Scenarios", () => {
            it("should handle complete buy free spin workflow", async () => {
                // Arrange
                const player = ProcessBetQueueTestFactory.createPlayer();
                const payload = ProcessBetQueueTestFactory.createPayload({ buyFreeSpin: true });
                enhancedConsumer.isValidBuyFreeSpin = jest.fn().mockReturnValue(true);
                jest.spyOn(CascadingProcessBetQueue.prototype.__proto__, 'proceedBet').mockImplementation(() => Promise.resolve());

                // Act
                await enhancedConsumer.proceedBet(player, payload);
                const betInfo = await enhancedConsumer.generateBetInfo(payload, null, player);

                // Assert
                expect(betInfo.buyFreeSpin).toBe(true);
                expect(betInfo.totalAmount).toBeGreaterThan(payload.betLevel * payload.coinValue * 20);
            });

            it("should handle promotion period validation correctly", () => {
                // Arrange
                const promotionPlayer = ProcessBetQueueTestFactory.createPlayer({
                    promotion: {
                        remainingBonusItems: 5,
                        initialBonusItem: 10,
                        freeSpinAvailable: 0,
                    },
                });

                // Act
                const isInPromotion = enhancedConsumer.isInPromotionPeriod(promotionPlayer);
                const canBuyFreeSpin = enhancedConsumer.isValidBuyFreeSpin(promotionPlayer);

                // Assert
                expect(isInPromotion).toBe(true);
                expect(canBuyFreeSpin).toBe(false);
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
