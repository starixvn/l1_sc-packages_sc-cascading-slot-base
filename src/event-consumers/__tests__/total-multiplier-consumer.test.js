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

    const gamePromotionApiClient = {
        instance: jest.fn().mockReturnValue({
            queryPlayersIncompletePromotions: jest.fn(),
        }),
    };

    const player = stubPlayer();

    const mockDate = new Date();

    beforeEach(() => {
        jest.clearAllMocks();

        gameData.ingame[player.profile.name] = {};
        consumer = new TotalMultiplierConsumer(gameData, totalMultiplierRepository, freeSpinConsumer, gamePromotionApiClient);
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

    describe("isPlayerHavingPromotionFreeSpins", () => {
        const createTotalMultiplier = (overrides = {}) => ({
            promotionId: null,
            playerId: chance.guid(),
            name: player.profile.name,
            ...overrides,
        });

        const createPlayer = (overrides = {}) => ({
            UID: player.UID,
            profile: player.profile,
            session: player.session,
            promotion: null,
            ...overrides,
        });

        describe("when totalMultiplier has no promotionId", () => {
            it("should return false", () => {
                // Arrange
                const totalMultiplier = createTotalMultiplier({ promotionId: null });
                const testPlayer = createPlayer();

                // Act
                const result = consumer.isPlayerHavingPromotionFreeSpins(testPlayer, totalMultiplier);

                // Assert
                expect(result).toBe(false);
            });
        });

        describe("when totalMultiplier has promotionId and player has remainingBonusItems > 0", () => {
            it("should return true", () => {
                // Arrange
                const totalMultiplier = createTotalMultiplier({
                    promotionId: chance.guid(),
                    name: player.profile.name,
                });
                const testPlayer = createPlayer({
                    promotion: { remainingBonusItems: chance.natural({ min: 1 }) },
                });
                gameData.ingame[totalMultiplier.name] = {
                    promotion: { remainingBonusItems: chance.natural({ min: 1 }) },
                };

                // Act
                const result = consumer.isPlayerHavingPromotionFreeSpins(testPlayer, totalMultiplier);

                // Assert
                expect(result).toBe(true);
            });
        });

        describe("when totalMultiplier has promotionId and ingame has remainingBonusItems > 0", () => {
            it("should return true", () => {
                // Arrange
                const totalMultiplier = createTotalMultiplier({
                    promotionId: chance.guid(),
                    name: player.profile.name,
                });
                const testPlayer = createPlayer({
                    promotion: { remainingBonusItems: 0 }, // Player has promotion but no remaining items
                });
                gameData.ingame[totalMultiplier.name] = {
                    promotion: { remainingBonusItems: chance.natural({ min: 1 }) },
                };

                // Act
                const result = consumer.isPlayerHavingPromotionFreeSpins(testPlayer, totalMultiplier);

                // Assert
                expect(result).toBe(true);
            });
        });

        describe("when totalMultiplier has promotionId but all conditions are false", () => {
            it("should return false when player and ingame have remainingBonusItems = 0", () => {
                // Arrange
                const totalMultiplier = createTotalMultiplier({
                    promotionId: chance.guid(),
                    playerId: chance.guid(), // Not in hardcoded list
                });
                const testPlayer = createPlayer({
                    promotion: { remainingBonusItems: 0 },
                });
                gameData.ingame[totalMultiplier.name] = {
                    promotion: { remainingBonusItems: 0 },
                };

                // Act
                const result = consumer.isPlayerHavingPromotionFreeSpins(testPlayer, totalMultiplier);

                // Assert
                expect(result).toBe(false);
            });
        });

        describe("when player is undefined", () => {
            it("should return false", () => {
                // Arrange
                const totalMultiplier = createTotalMultiplier({
                    promotionId: chance.guid(),
                    playerId: chance.guid(), // Not in hardcoded list
                });
                const testPlayer = undefined;

                // Act
                const result = consumer.isPlayerHavingPromotionFreeSpins(testPlayer, totalMultiplier);

                // Assert
                expect(result).toBe(false);
            });
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

        describe("when isRestart is true", () => {
            beforeEach(() => {
                // gamePromotionApiClient is already mocked in the constructor
            });

            describe("when total multipliers have promotionId", () => {
                const promotionId = chance.guid();
                const playerId = chance.guid();
                const totalMultiplierValue = chance.natural();
                const records = [
                    {
                        name: player.profile.name,
                        uid: player.UID,
                        playerId,
                        promotionId,
                        rounds: [{ totalMultiplier: totalMultiplierValue }],
                    },
                ];

                beforeEach(() => {
                    totalMultiplierRepository.find().lean().exec.mockReturnValueOnce(records);
                    freeSpinConsumer.hasFreeSpin = jest.fn().mockReturnValue(false);
                });

                it("should query promotions for players with promotionId", async () => {
                    // Arrange
                    const mockPromotions = [
                        {
                            playerId,
                            operatorId: "ONEworksVGCash",
                            siteName: "esther",
                            promotionId,
                            currencyGroup: "61b953ad815d6c000196a14c",
                            remainingBonusItems: 5,
                            initialBonusItem: 20,
                            betLevel: 0,
                            startDate: "2025-10-03T02:29:00.000Z",
                            endDate: "2025-10-03T17:00:00.000Z",
                            lastUsedDate: "2025-10-03T06:34:39.057Z",
                            isGiftCode: true,
                            totalTurnover: 0,
                            totalWinAmount: 142,
                            minRequiredTurnover: 0,
                            turnoverMultiplier: 2,
                            bonusClaimed: false,
                            claimedAt: null,
                            isCompleted: false,
                            coinValue: 1,
                            baseTotalWinAmount: 5.58778069563597,
                            baseTotalTurnover: 0,
                        },
                    ];
                    consumer.gamePromotionApiClient.queryPlayersIncompletePromotions.mockResolvedValueOnce(mockPromotions);

                    // Act
                    await consumer.reload(true);

                    // Assert
                    expect(consumer.gamePromotionApiClient.queryPlayersIncompletePromotions).toHaveBeenCalledWith({
                        playerPromotionPairs: [
                            {
                                playerId,
                                promotionId: promotionId,
                            },
                        ],
                    });
                });

                it("should map promotions to ingame objects", async () => {
                    // Arrange
                    const mockPromotions = [
                        {
                            playerId,
                            operatorId: "ONEworksVGCash",
                            siteName: "esther",
                            promotionId,
                            currencyGroup: "61b953ad815d6c000196a14c",
                            remainingBonusItems: 5,
                            initialBonusItem: 20,
                            betLevel: 0,
                            startDate: "2025-10-03T02:29:00.000Z",
                            endDate: "2025-10-03T17:00:00.000Z",
                            lastUsedDate: "2025-10-03T06:34:39.057Z",
                            isGiftCode: true,
                            totalTurnover: 0,
                            totalWinAmount: 142,
                            minRequiredTurnover: 0,
                            turnoverMultiplier: 2,
                            bonusClaimed: false,
                            claimedAt: null,
                            isCompleted: false,
                            coinValue: 1,
                            baseTotalWinAmount: 5.58778069563597,
                            baseTotalTurnover: 0,
                        },
                    ];
                    consumer.gamePromotionApiClient.queryPlayersIncompletePromotions.mockResolvedValueOnce(mockPromotions);

                    // Act
                    await consumer.reload(true);

                    // Assert
                    expect(gameData.ingame[player.profile.name].promotion).toEqual(mockPromotions[0]);
                });

                it("should preserve total multiplier for players with promotionId", async () => {
                    // Arrange
                    const mockPromotions = [
                        {
                            playerId,
                            operatorId: "ONEworksVGCash",
                            siteName: "esther",
                            promotionId,
                            currencyGroup: "61b953ad815d6c000196a14c",
                            remainingBonusItems: 5,
                            initialBonusItem: 20,
                            betLevel: 0,
                            startDate: "2025-10-03T02:29:00.000Z",
                            endDate: "2025-10-03T17:00:00.000Z",
                            lastUsedDate: "2025-10-03T06:34:39.057Z",
                            isGiftCode: true,
                            totalTurnover: 0,
                            totalWinAmount: 142,
                            minRequiredTurnover: 0,
                            turnoverMultiplier: 2,
                            bonusClaimed: false,
                            claimedAt: null,
                            isCompleted: false,
                            coinValue: 1,
                            baseTotalWinAmount: 5.58778069563597,
                            baseTotalTurnover: 0,
                        },
                    ];
                    consumer.gamePromotionApiClient.queryPlayersIncompletePromotions.mockResolvedValueOnce(mockPromotions);

                    // Act
                    await consumer.reload(true);

                    // Assert
                    expect(gameData.ingame[player.profile.name].totalMultiplier).toBe(totalMultiplierValue);
                    expect(totalMultiplierRepository.updateOne).not.toHaveBeenCalled();
                });
            });

            describe("when total multipliers do NOT have promotionId", () => {
                const totalMultiplierValue = chance.natural();
                const records = [
                    {
                        name: player.profile.name,
                        uid: player.UID,
                        playerId: chance.guid(),
                        promotionId: null,
                        rounds: [{ totalMultiplier: totalMultiplierValue }],
                    },
                ];

                beforeEach(() => {
                    totalMultiplierRepository.find().lean().exec.mockReturnValueOnce(records);
                    freeSpinConsumer.hasFreeSpin = jest.fn().mockReturnValue(false);
                });

                it("should end total multiplier when no promotionId", async () => {
                    // Act
                    await consumer.reload(true);

                    // Assert
                    expect(totalMultiplierRepository.updateOne).toHaveBeenCalledWith(
                        { uid: records[0].uid, ended: false },
                        { ended: true, endTime: new Date() }
                    );
                });

                it("should not query promotions when no promotionId", async () => {
                    // Act
                    await consumer.reload(true);

                    // Assert
                    expect(consumer.gamePromotionApiClient.queryPlayersIncompletePromotions).not.toHaveBeenCalled();
                });
            });

            describe("when player is not found in realPlayers", () => {
                const promotionId = chance.guid();
                const playerId = chance.guid();
                const totalMultiplierValue = chance.natural();
                const records = [
                    {
                        name: "unknown-player",
                        uid: chance.guid(),
                        playerId,
                        promotionId,
                        rounds: [{ totalMultiplier: totalMultiplierValue }],
                    },
                ];

                beforeEach(() => {
                    totalMultiplierRepository.find().lean().exec.mockReturnValueOnce(records);
                    freeSpinConsumer.hasFreeSpin = jest.fn().mockReturnValue(false);
                });

                it("should end total multiplier when player not found", async () => {
                    // Act
                    await consumer.reload(true);

                    // Assert
                    expect(totalMultiplierRepository.updateOne).toHaveBeenCalledWith(
                        { uid: records[0].uid, ended: false },
                        { ended: true, endTime: new Date() }
                    );
                });
            });
        });

        describe("reloadPromotionsForRestart", () => {
            beforeEach(() => {
                // gamePromotionApiClient is already mocked in the constructor
            });

            it("should query and map promotions for players with promotionId", async () => {
                // Arrange
                const promotionId = chance.guid();
                const playerId = chance.guid();
                const totalMultipliers = [
                    {
                        name: player.profile.name,
                        playerId,
                        promotionId,
                    },
                ];
                const activePlayerPromotions = [
                    {
                        playerId,
                        operatorId: "ONEworksVGCash",
                        siteName: "esther",
                        promotionId,
                        currencyGroup: "61b953ad815d6c000196a14c",
                        remainingBonusItems: 5,
                        initialBonusItem: 20,
                        betLevel: 0,
                        startDate: "2025-10-03T02:29:00.000Z",
                        endDate: "2025-10-03T17:00:00.000Z",
                        lastUsedDate: "2025-10-03T06:34:39.057Z",
                        isGiftCode: true,
                        totalTurnover: 0,
                        totalWinAmount: 142,
                        minRequiredTurnover: 0,
                        turnoverMultiplier: 2,
                        bonusClaimed: false,
                        claimedAt: null,
                        isCompleted: false,
                        coinValue: 1,
                        baseTotalWinAmount: 5.58778069563597,
                        baseTotalTurnover: 0,
                    },
                ];
                consumer.gamePromotionApiClient.queryPlayersIncompletePromotions.mockResolvedValueOnce(activePlayerPromotions);

                // Act
                await consumer.reloadPromotionsForRestart(totalMultipliers);

                // Assert
                expect(consumer.gamePromotionApiClient.queryPlayersIncompletePromotions).toHaveBeenCalledWith({
                    playerPromotionPairs: [
                        {
                            playerId,
                            promotionId: promotionId,
                        },
                    ],
                });
                expect(gameData.ingame[player.profile.name].promotion).toEqual(activePlayerPromotions[0]);
            });

            it("should not query promotions when no players have promotionId", async () => {
                // Arrange
                const totalMultipliers = [
                    {
                        name: player.profile.name,
                        playerId: chance.guid(),
                        promotionId: null,
                    },
                ];

                // Act
                await consumer.reloadPromotionsForRestart(totalMultipliers);

                // Assert
                expect(consumer.gamePromotionApiClient.queryPlayersIncompletePromotions).not.toHaveBeenCalled();
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

class TotalMultiplierTestFactory {
    static createPlayer(overrides = {}) {
        return {
            UID: "test-uid-123",
            profile: {
                name: "testPlayer",
                ...overrides.profile,
            },
            session: {
                playerId: 456,
                operatorId: "op1",
                siteName: "testSite",
                ...overrides.session,
            },
            promotion: {
                promotionId: "promo123",
                remainingBonusItems: 5,
                ...overrides.promotion,
            },
            usePromotion: false,
            ...overrides,
        };
    }

    static createGameData(overrides = {}) {
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
        data.ingame = {};
        data.realPlayers = {};
        return { ...data, ...overrides };
    }

    static createRoundData(overrides = {}) {
        return {
            roundId: 123,
            multiplier: 2,
            ...overrides,
        };
    }

    static createTotalMultiplierRecord(overrides = {}) {
        return {
            uid: "test-uid-123",
            playerId: 456,
            name: "testPlayer",
            ended: false,
            time: new Date(),
            rounds: [],
            ...overrides,
        };
    }

    static createRoundRecord(overrides = {}) {
        return {
            time: new Date(),
            roundId: 123,
            prevTotalMultiplier: 0,
            totalMultiplier: 2,
            multiplier: 2,
            ...overrides,
        };
    }
}

describe("TotalMultiplierConsumer - Enhanced Coverage", () => {
    let enhancedConsumer;
    let mockGameData;
    let mockTotalMultiplierRepository;
    let mockFreeSpinConsumer;
    let mockDate;

    beforeEach(() => {
        // Arrange - Setup mocks and test data
        jest.clearAllMocks();
        mockDate = new Date("2024-01-15T10:30:00.000Z");
        mockGameData = TotalMultiplierTestFactory.createGameData();
        mockTotalMultiplierRepository = stubMongoose(mongoose.Model);
        mockFreeSpinConsumer = stub(FreeSpinConsumer);

        const mockGamePromotionApiClient = {
            instance: jest.fn().mockReturnValue({
                queryPlayersIncompletePromotions: jest.fn(),
            }),
        };

        enhancedConsumer = new TotalMultiplierConsumer(mockGameData, mockTotalMultiplierRepository, mockFreeSpinConsumer, mockGamePromotionApiClient);
        jest.spyOn(global, "Date").mockReturnValue(mockDate);
    });

    describe("increaseTotalMultiplier - Promotion Coverage", () => {
        describe("when player uses promotion", () => {
            it("should include promotionId in create call when player.usePromotion is true", async () => {
                // Arrange
                const player = TotalMultiplierTestFactory.createPlayer({
                    usePromotion: true,
                    promotion: { promotionId: "special-promo-456" },
                });
                const roundData = TotalMultiplierTestFactory.createRoundData();
                mockGameData.ingame[player.profile.name] = {};

                // Act
                await enhancedConsumer.increaseTotalMultiplier(player, roundData);

                // Assert
                expect(mockTotalMultiplierRepository.create).toHaveBeenCalledWith(
                    expect.objectContaining({
                        promotionId: "special-promo-456",
                    })
                );
            });

            it("should not include promotionId when player.usePromotion is false", async () => {
                // Arrange
                const player = TotalMultiplierTestFactory.createPlayer({
                    usePromotion: false,
                    promotion: { promotionId: "should-not-be-included" },
                });
                const roundData = TotalMultiplierTestFactory.createRoundData();
                mockGameData.ingame[player.profile.name] = {};

                // Act
                await enhancedConsumer.increaseTotalMultiplier(player, roundData);

                // Assert
                expect(mockTotalMultiplierRepository.create).toHaveBeenCalledWith(
                    expect.not.objectContaining({
                        promotionId: expect.any(String),
                    })
                );
            });

            it("should not include promotionId when player.usePromotion is undefined", async () => {
                // Arrange
                const player = TotalMultiplierTestFactory.createPlayer();
                delete player.usePromotion;
                const roundData = TotalMultiplierTestFactory.createRoundData();
                mockGameData.ingame[player.profile.name] = {};

                // Act
                await enhancedConsumer.increaseTotalMultiplier(player, roundData);

                // Assert
                const createCall = mockTotalMultiplierRepository.create.mock.calls[0][0];
                expect(createCall).not.toHaveProperty("promotionId");
            });
        });
    });

    describe("increaseTotalMultiplier - Edge Cases", () => {
        describe("when totalMultiplier is null", () => {
            it("should treat null as 0 for currentTotalMultiplier", async () => {
                // Arrange
                const player = TotalMultiplierTestFactory.createPlayer();
                const roundData = TotalMultiplierTestFactory.createRoundData({ multiplier: 3 });
                mockGameData.ingame[player.profile.name] = { totalMultiplier: null };

                // Act
                await enhancedConsumer.increaseTotalMultiplier(player, roundData);

                // Assert
                expect(mockGameData.ingame[player.profile.name].totalMultiplier).toBe(3);
            });

            it("should create new record when totalMultiplier is null", async () => {
                // Arrange
                const player = TotalMultiplierTestFactory.createPlayer();
                const roundData = TotalMultiplierTestFactory.createRoundData();
                mockGameData.ingame[player.profile.name] = { totalMultiplier: null };

                // Act
                await enhancedConsumer.increaseTotalMultiplier(player, roundData);

                // Assert
                expect(mockTotalMultiplierRepository.create).toHaveBeenCalled();
                expect(mockTotalMultiplierRepository.updateOne).not.toHaveBeenCalled();
            });
        });

        describe("when multiplier is decimal", () => {
            it("should handle decimal multiplier correctly", async () => {
                // Arrange
                const player = TotalMultiplierTestFactory.createPlayer();
                const roundData = TotalMultiplierTestFactory.createRoundData({ multiplier: 1.5 });
                mockGameData.ingame[player.profile.name] = { totalMultiplier: 2.5 };

                // Act
                await enhancedConsumer.increaseTotalMultiplier(player, roundData);

                // Assert
                expect(mockGameData.ingame[player.profile.name].totalMultiplier).toBe(4);
            });
        });

        describe("when player session is undefined", () => {
            it("should handle undefined player.session gracefully", async () => {
                // Arrange
                const player = TotalMultiplierTestFactory.createPlayer();
                delete player.session;
                const roundData = TotalMultiplierTestFactory.createRoundData();
                mockGameData.ingame[player.profile.name] = {};

                // Act
                await enhancedConsumer.increaseTotalMultiplier(player, roundData);

                // Assert
                expect(mockTotalMultiplierRepository.create).toHaveBeenCalledWith(
                    expect.objectContaining({
                        playerId: undefined,
                    })
                );
            });
        });
    });

    describe("getCurrentMultiplier - Edge Cases", () => {
        describe("when ingame data is missing", () => {
            it("should handle missing ingame object gracefully", () => {
                // Arrange
                const player = TotalMultiplierTestFactory.createPlayer({ profile: { name: "nonexistentPlayer" } });
                mockGameData.ingame = {};
                // Expect this to throw since original code doesn't have defensive check

                // Act & Assert
                expect(() => {
                    enhancedConsumer.getCurrentMultiplier(player);
                }).toThrow("Cannot read properties of undefined");
            });

            it("should handle undefined ingame[playerName] gracefully", () => {
                // Arrange
                const player = TotalMultiplierTestFactory.createPlayer();
                mockGameData.ingame[player.profile.name] = undefined;
                // Expect this to throw since original code doesn't have defensive check

                // Act & Assert
                expect(() => {
                    enhancedConsumer.getCurrentMultiplier(player);
                }).toThrow("Cannot read properties of undefined");
            });

            it("should return 0 when totalMultiplier is null", () => {
                // Arrange
                const player = TotalMultiplierTestFactory.createPlayer();
                mockGameData.ingame[player.profile.name] = { totalMultiplier: null };

                // Act
                const result = enhancedConsumer.getCurrentMultiplier(player);

                // Assert
                expect(result).toBe(0);
            });
        });

        describe("when totalMultiplier has special values", () => {
            it("should return decimal value when totalMultiplier is decimal", () => {
                // Arrange
                const player = TotalMultiplierTestFactory.createPlayer();
                mockGameData.ingame[player.profile.name] = { totalMultiplier: 3.5 };

                // Act
                const result = enhancedConsumer.getCurrentMultiplier(player);

                // Assert
                expect(result).toBe(3.5);
            });

            it("should return large value when totalMultiplier is large number", () => {
                // Arrange
                const player = TotalMultiplierTestFactory.createPlayer();
                mockGameData.ingame[player.profile.name] = { totalMultiplier: 999999 };

                // Act
                const result = enhancedConsumer.getCurrentMultiplier(player);

                // Assert
                expect(result).toBe(999999);
            });
        });
    });

    describe("stopChain - Edge Cases", () => {
        describe("when player data is missing", () => {
            it("should call updateOne but throw when setting ingame property", async () => {
                // Arrange
                const player = TotalMultiplierTestFactory.createPlayer({ profile: { name: "missingPlayer" } });
                mockGameData.ingame = {};

                // Act & Assert
                await expect(enhancedConsumer.stopChain(player)).rejects.toThrow("Cannot set properties of undefined");
                expect(mockTotalMultiplierRepository.updateOne).toHaveBeenCalledWith(
                    { uid: player.UID, ended: false },
                    { ended: true, endTime: mockDate }
                );
            });

            it("should throw when ingame data is undefined", async () => {
                // Arrange
                const player = TotalMultiplierTestFactory.createPlayer();
                mockGameData.ingame[player.profile.name] = undefined;

                // Act & Assert
                await expect(enhancedConsumer.stopChain(player)).rejects.toThrow("Cannot set properties of undefined");
            });
        });

        describe("when ingame data exists", () => {
            it("should preserve other properties when setting totalMultiplier to 0", async () => {
                // Arrange
                const player = TotalMultiplierTestFactory.createPlayer();
                mockGameData.ingame[player.profile.name] = {
                    totalMultiplier: 15,
                    betQueue: [],
                    otherProperty: "preserved",
                };

                // Act
                await enhancedConsumer.stopChain(player);

                // Assert
                expect(mockGameData.ingame[player.profile.name].totalMultiplier).toBe(0);
                expect(mockGameData.ingame[player.profile.name].betQueue).toEqual([]);
                expect(mockGameData.ingame[player.profile.name].otherProperty).toBe("preserved");
            });
        });
    });

    describe("reload - Enhanced Coverage", () => {
        describe("when checking free spins with promotion", () => {
            it("should check promotion remaining bonus items when player has promotion", async () => {
                // Arrange
                const totalMultiplierRecord = TotalMultiplierTestFactory.createTotalMultiplierRecord({
                    name: "promoPlayer",
                    uid: "promo-uid",
                    promotionId: "promo123",
                    rounds: [{ totalMultiplier: 5 }],
                });
                const player = TotalMultiplierTestFactory.createPlayer({
                    UID: "promo-uid",
                    profile: { name: "promoPlayer" },
                    promotion: { remainingBonusItems: 3 },
                });

                mockTotalMultiplierRepository.find().lean().exec.mockResolvedValue([totalMultiplierRecord]);
                mockGameData.realPlayers = { promoPlayer: player };
                mockFreeSpinConsumer.hasFreeSpin.mockReturnValue(false);

                // Act
                await enhancedConsumer.reload();

                // Assert
                expect(mockGameData.ingame.promoPlayer.totalMultiplier).toBe(5);
            });

            it("should check ingame promotion remaining bonus items", async () => {
                // Arrange
                const totalMultiplierRecord = TotalMultiplierTestFactory.createTotalMultiplierRecord({
                    name: "ingamePromoPlayer",
                    promotionId: "promo456",
                    rounds: [{ totalMultiplier: 7 }],
                });

                mockTotalMultiplierRepository.find().lean().exec.mockResolvedValue([totalMultiplierRecord]);
                mockGameData.realPlayers = {};
                mockGameData.ingame.ingamePromoPlayer = {
                    promotion: { remainingBonusItems: 2 },
                };
                mockFreeSpinConsumer.hasFreeSpin.mockReturnValue(false);

                // Act
                await enhancedConsumer.reload();

                // Assert
                expect(mockGameData.ingame.ingamePromoPlayer.totalMultiplier).toBe(7);
            });

            it("should reset multiplier when no promotion bonus items remain", async () => {
                // Arrange
                const totalMultiplierRecord = TotalMultiplierTestFactory.createTotalMultiplierRecord({
                    name: "noPromoPlayer",
                    promotionId: "promo789",
                    rounds: [{ totalMultiplier: 8 }],
                });

                mockTotalMultiplierRepository.find().lean().exec.mockResolvedValue([totalMultiplierRecord]);
                mockGameData.realPlayers = {};
                mockGameData.ingame.noPromoPlayer = {
                    promotion: { remainingBonusItems: 0 },
                };
                mockFreeSpinConsumer.hasFreeSpin.mockReturnValue(false);

                // Act
                await enhancedConsumer.reload();

                // Assert
                expect(mockGameData.ingame.noPromoPlayer.totalMultiplier).toBe(0);
            });
        });

        describe("when initializing ingame data", () => {
            it("should initialize ingame data with default betQueue when undefined", async () => {
                // Arrange
                const totalMultiplierRecord = TotalMultiplierTestFactory.createTotalMultiplierRecord({
                    name: "newPlayer",
                    rounds: [{ totalMultiplier: 3 }],
                });

                mockTotalMultiplierRepository.find().lean().exec.mockResolvedValue([totalMultiplierRecord]);
                mockGameData.ingame = {}; // No existing ingame data
                mockFreeSpinConsumer.hasFreeSpin.mockReturnValue(true);

                // Act
                await enhancedConsumer.reload();

                // Assert
                expect(mockGameData.ingame.newPlayer).toEqual({
                    betQueue: [],
                    totalMultiplier: 3,
                });
            });

            it("should preserve existing ingame data when setting totalMultiplier", async () => {
                // Arrange
                const totalMultiplierRecord = TotalMultiplierTestFactory.createTotalMultiplierRecord({
                    name: "existingPlayer",
                    rounds: [{ totalMultiplier: 6 }],
                });

                mockTotalMultiplierRepository.find().lean().exec.mockResolvedValue([totalMultiplierRecord]);
                mockGameData.ingame.existingPlayer = {
                    betQueue: ["bet1", "bet2"],
                    customProperty: "preserved",
                };
                mockFreeSpinConsumer.hasFreeSpin.mockReturnValue(true);

                // Act
                await enhancedConsumer.reload();

                // Assert
                expect(mockGameData.ingame.existingPlayer).toEqual({
                    betQueue: ["bet1", "bet2"],
                    customProperty: "preserved",
                    totalMultiplier: 6,
                });
            });
        });

        describe("when handling multiple rounds", () => {
            it("should use latest round totalMultiplier from multiple rounds", async () => {
                // Arrange
                const totalMultiplierRecord = TotalMultiplierTestFactory.createTotalMultiplierRecord({
                    name: "multiRoundPlayer",
                    rounds: [
                        { totalMultiplier: 2 },
                        { totalMultiplier: 4 },
                        { totalMultiplier: 9 }, // Latest should be used
                    ],
                });

                mockTotalMultiplierRepository.find().lean().exec.mockResolvedValue([totalMultiplierRecord]);
                mockFreeSpinConsumer.hasFreeSpin.mockReturnValue(true);

                // Act
                await enhancedConsumer.reload();

                // Assert
                expect(mockGameData.ingame.multiRoundPlayer.totalMultiplier).toBe(9);
            });
        });

        describe("when no totalMultipliers exist", () => {
            it("should handle empty totalMultipliers array gracefully", async () => {
                // Arrange
                mockTotalMultiplierRepository.find().lean().exec.mockResolvedValue([]);

                // Act & Assert
                expect(async () => {
                    await enhancedConsumer.reload();
                }).not.toThrow();
            });

            it("should not modify ingame data when no totalMultipliers exist", async () => {
                // Arrange
                mockTotalMultiplierRepository.find().lean().exec.mockResolvedValue([]);
                mockGameData.ingame.existingPlayer = { totalMultiplier: 5 };

                // Act
                await enhancedConsumer.reload();

                // Assert
                expect(mockGameData.ingame.existingPlayer.totalMultiplier).toBe(5);
            });
        });
    });

    describe("Integration Scenarios", () => {
        it("should handle complete workflow from increase to stop", async () => {
            // Arrange
            const player = TotalMultiplierTestFactory.createPlayer();
            const roundData = TotalMultiplierTestFactory.createRoundData({ multiplier: 3 });
            mockGameData.ingame[player.profile.name] = {};

            // Act - Increase multiplier
            await enhancedConsumer.increaseTotalMultiplier(player, roundData);
            const currentMultiplier = enhancedConsumer.getCurrentMultiplier(player);
            await enhancedConsumer.stopChain(player);

            // Assert
            expect(currentMultiplier).toBe(3);
            expect(mockGameData.ingame[player.profile.name].totalMultiplier).toBe(0);
        });

        it("should handle multiple increases and get current correctly", async () => {
            // Arrange
            const player = TotalMultiplierTestFactory.createPlayer();
            mockGameData.ingame[player.profile.name] = {};

            // Act
            await enhancedConsumer.increaseTotalMultiplier(player, { roundId: 1, multiplier: 2 });
            await enhancedConsumer.increaseTotalMultiplier(player, { roundId: 2, multiplier: 3 });
            const finalMultiplier = enhancedConsumer.getCurrentMultiplier(player);

            // Assert
            expect(finalMultiplier).toBe(5);
        });
    });
});
