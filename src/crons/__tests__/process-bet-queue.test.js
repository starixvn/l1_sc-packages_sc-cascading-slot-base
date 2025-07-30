import Chance from "chance";
import { UserInfo, UserSession } from "jest-auto-fixture/src/models";
import { stub, stubMongoose } from "jest-micro-auto-stub";
import mongoose from "mongoose";
import { logger } from "sc-common";
import GameManagementApiClientFactory from "sc-game-base/src/core/game-management-api";
import { EventConsumers, SlotGameData } from "sc-slot-game-base";
import { FreeSpinConsumer, SettleGameRoundConsumer } from "../../event-consumers";
import CascadingProcessBetQueue from "../cascading-process-bet-queue";

describe("cascadingProcessBetQueue", () => {
    jest.mock("sc-common");

    const chance = new Chance();
    const freeSpinsConsumer = stub(FreeSpinConsumer);
    const settleGameRoundConsumer = stub(SettleGameRoundConsumer);
    const placeBet = jest.fn();
    const roundsRepository = stubMongoose(mongoose.Model);
    const idCountersConsumer = stub(EventConsumers.IdCountersConsumer);
    const placeBetPublisher = { publishGameFailedBet: jest.fn() };
    const gameData = stubGameData();
    const player = stubPlayer();
    const definition = { id: chance.natural() };
    const baseMetrics = {};

    const gameManagementApiClientFactory = stub(GameManagementApiClientFactory);
    const gameManagementApiClient = {};
    gameManagementApiClientFactory.instance.mockReturnValue(gameManagementApiClient);

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
            gameManagementApiClientFactory,
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
                    totalAmount: freeSpinInfo.betLevel * freeSpinInfo.coinValue * freeSpinInfo.betMultiplier,
                    contributionAmount: 0,
                    contributionRate: 0,
                });
            });
        });

        describe("when bet is NOT free spin", () => {
            const payload = { freeBet: false, betLevel: 1, coinValue: 0.1 };

            it("should return correct bet info", async () => {
                // Act
                const actualResult = await consumer.generateBetInfo(payload, undefined, player);

                // Assert
                expect(actualResult).toStrictEqual({
                    ...payload,
                    betMultiplier: gameData.gameConfigs.cascadingSlotsConfig.betMultiplier,
                    totalAmount: payload.betLevel * payload.coinValue * gameData.gameConfigs.cascadingSlotsConfig.betMultiplier,
                    contributionAmount: 0,
                    contributionRate: 0,
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
                    oddsByCounts: gameData.gameConfigs.cascadingSlotsConfig.oddsByCounts,
                    freeSpins: gameData.gameConfigs.cascadingSlotsConfig.freeSpins,
                },
                playerId: player.session.memberId,
                siteId: player.session.siteId,
                siteName: player.session.siteName,
                currency: player.session.currencyName,
                operatorId: player.session.partnerId,
                appType: player.session.system,
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
            expect(consumer.upsertBet).toBeCalledWith(player, roundId, bet, rate);
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
