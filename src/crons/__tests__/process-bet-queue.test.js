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
            it("should call executeInterceptorEvent with complete bet structure including betLevel and coinValue", async () => {
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
                        betLevel: betWithLevels.betLevel, // ✅ Critical: Must be included
                        coinValue: betWithLevels.coinValue, // ✅ Critical: Must be included
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
                    },
                    balance,
                });
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
