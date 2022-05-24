import CascadingProcessBetQueue from "../cascading-process-bet-queue";
import { SlotGameData, EventConsumers } from "sc-slot-game-base";
import { FreeSpinConsumer, SettleGameRoundConsumer, TotalMultiplierConsumer } from "../../event-consumers";
import { stub, stubMongoose } from "jest-micro-auto-stub";
import { logger } from "sc-common";
import { UserInfo, UserSession } from "jest-auto-fixture/src/models";
import mongoose from "mongoose";
import Chance from "chance";

describe("cascadingProcessBetQueue", () => {
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

        consumer = new CascadingProcessBetQueue({
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

            it("should call totalMultiplierConsumer.getCurrentMultiplier", async () => {
                // Act
                await consumer.generateBetInfo(payload, undefined, player);

                // Assert
                expect(totalMultiplierConsumer.getCurrentMultiplier).toBeCalledWith(player);
            });

            describe("when player is having total multiplier", () => {
                it("should call totalMultiplier.stopChain", async () => {
                    // Arrange
                    totalMultiplierConsumer.getCurrentMultiplier.mockReturnValueOnce(chance.natural());

                    // Act
                    await consumer.generateBetInfo(payload, undefined, player);

                    // Assert
                    expect(totalMultiplierConsumer.stopChain).toBeCalled();
                });
            });

            it("should return correct bet info", async () => {
                // Act
                const actualResult = await consumer.generateBetInfo(payload, undefined, player);

                // Assert
                expect(actualResult).toStrictEqual({
                    ...payload,
                    betMultiplier: gameData.gameConfigs.slotsConfig.betMultiplier,
                    amount: payload.betLevel * payload.coinValue,
                    totalAmount: payload.betLevel * payload.coinValue * gameData.gameConfigs.slotsConfig.betMultiplier,
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
        data.betMultiplier = 20;

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
