import UserChainConsumer, { RTP_TYPE } from "../user-chain-consumer";

// Chain RTP categorization based on chain names (same as in source)
const RTP_CHAIN_CATEGORIES = {
    [RTP_TYPE.HIGH]: ["discovery", "cliffhanger"],
    [RTP_TYPE.BALANCE]: ["tease", "wave", "comeback"],
};

// Shared test data factories (DRY principle)
const createMockGameData = (overrides = {}) => ({
    gameConfigs: {
        gameId: "test-game-123",
        cascadingSlotsConfig: {
            betMultiplier: 20,
            resultChains: {
                enabled: true,
            },
        },
    },
    playerChains: {},
    availableChains: [
        {
            name: "discovery-75boards-01",
            baseBetAmount: 0.1,
            totalBoardCount: 75,
        },
        {
            name: "cliffhanger-75boards-01",
            baseBetAmount: 0.1,
            totalBoardCount: 75,
        },
        {
            name: "wave-50boards-01",
            baseBetAmount: 0.1,
            totalBoardCount: 50,
        },
        {
            name: "tease-50boards-01",
            baseBetAmount: 0.1,
            totalBoardCount: 50,
        },
        {
            name: "comeback-100boards-01",
            baseBetAmount: 0.1,
            totalBoardCount: 100,
        },
    ],
    ...overrides,
});

const createMockLogService = () => ({
    log: jest.fn(),
    logWarning: jest.fn(),
    logError: jest.fn(),
});

const createMockAppConfigs = (overrides = {}) => ({
    resultChains: {
        maxChains: 300,
        maxPlayerChains: 300,
        memoryExpirationMinutes: 30,
        assignment: {
            minPlayableBoards: 50,
            maxBoards: 100,
            boardsMultiplier: 0.25,
            boardRange: [50, 75, 100, 125, 150, 175, 200],
        },
        ...overrides,
    },
});

// Shared consumer creation utility
const createConsumerWithMocks = (mocks = {}) => {
    // Reset all mocks
    jest.clearAllMocks();

    // Apply custom mocks
    if (mocks.availableChains !== undefined) {
        mockGameData.availableChains = mocks.availableChains;
    }

    // Create consumer instance
    const consumer = new UserChainConsumer({
        gameData: mockGameData,
        assignmentRepository: mockAssignmentRepository,
        logService: mockLogService,
        appConfigs: mockAppConfigs,
    });

    // Apply method mocks after consumer is created
    if (mocks.getApplicableBoardCount !== undefined) {
        jest.spyOn(consumer, "getApplicableBoardCount").mockReturnValue(mocks.getApplicableBoardCount);
    }

    if (mocks.calculateBaseBetAmount !== undefined) {
        jest.spyOn(consumer, "calculateBaseBetAmount").mockReturnValue(mocks.calculateBaseBetAmount);
    }

    if (mocks.filterChains !== undefined) {
        jest.spyOn(consumer, "filterChains").mockReturnValue(mocks.filterChains);
    }

    if (mocks.selectRandom !== undefined) {
        jest.spyOn(consumer, "selectRandom").mockReturnValue(mocks.selectRandom);
    }

    return consumer;
};

const createMockAssignmentRepository = () => ({
    create: jest.fn().mockResolvedValue({ _id: "test-assignment-id" }),
    find: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([]),
        }),
    }),
    findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(null),
        }),
    }),
    distinct: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
    }),
    findOneAndUpdate: jest.fn().mockResolvedValue({
        _id: "test-assignment-id",
        playerName: "testPlayer",
        chainName: "discovery-75boards-01",
        status: "active",
    }),
});

const createPlayerContext = (overrides = {}) => ({
    playerId: "player-123",
    betLevel: 1,
    coinValue: 0.1,
    balance: 120,
    operatorId: "test-operator",
    gameId: "test-game",
    currency: "USD",
    ...overrides,
});

const createActiveAssignment = (overrides = {}) => ({
    playerName: "testPlayer",
    chainName: "discovery-75boards-01",
    currentBoardIndex: 0,
    totalBoards: 75,
    assignedAt: new Date(),
    betLevel: 1,
    coinValue: 0.1,
    playerId: "player-123",
    ...overrides,
});

// Global mocks for the test suite
let mockGameData;
let mockLogService;
let mockAppConfigs;
let mockAssignmentRepository;

describe("UserChainConsumer", () => {
    let userChainConsumer;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create fresh mocks for each test using factories
        mockGameData = createMockGameData();
        mockLogService = createMockLogService();
        mockAppConfigs = createMockAppConfigs();
        mockAssignmentRepository = createMockAssignmentRepository();

        userChainConsumer = new UserChainConsumer({
            gameData: mockGameData,
            assignmentRepository: mockAssignmentRepository,
            logService: mockLogService,
            appConfigs: mockAppConfigs,
        });
    });

    describe("constructor", () => {
        it("should initialize with gameData dependency", () => {
            // Arrange & Act (done in beforeEach)

            // Assert
            expect(userChainConsumer.gameData).toBe(mockGameData);
        });

        it("should initialize with assignmentRepository dependency", () => {
            // Arrange & Act (done in beforeEach)

            // Assert
            expect(userChainConsumer.assignmentRepository).toBe(mockAssignmentRepository);
        });

        it("should initialize with logService dependency", () => {
            // Arrange & Act (done in beforeEach)

            // Assert
            expect(userChainConsumer.logService).toBe(mockLogService);
        });
    });

    describe("loadActive", () => {
        describe("when chains are disabled", () => {
            it("should return early without loading chains", async () => {
                // Arrange
                mockGameData.gameConfigs.cascadingSlotsConfig.resultChains.enabled = false;

                // Act
                await userChainConsumer.loadActive();

                // Assert
                expect(mockAssignmentRepository.find).not.toHaveBeenCalled();
            });

            it("should not populate playerChains", async () => {
                // Arrange
                mockGameData.gameConfigs.cascadingSlotsConfig.resultChains.enabled = false;
                mockGameData.playerChains = {};

                // Act
                await userChainConsumer.loadActive();

                // Assert
                expect(Object.keys(mockGameData.playerChains)).toHaveLength(0);
            });
        });

        describe("when memoryExpirationMinutes is not configured", () => {
            it("should log error message", async () => {
                // Arrange
                const incompleteAppConfigs = createMockAppConfigs({
                    // memoryExpirationMinutes is missing
                    memoryExpirationMinutes: undefined,
                });
                const consumerWithIncompleteConfig = new UserChainConsumer({
                    gameData: mockGameData,
                    assignmentRepository: mockAssignmentRepository,
                    logService: mockLogService,
                    appConfigs: incompleteAppConfigs,
                });

                // Act
                await consumerWithIncompleteConfig.loadActive();

                // Assert
                expect(mockLogService.logError).toHaveBeenCalledWith(
                    expect.stringContaining("memoryExpirationMinutes or maxPlayerChains is not configured in appConfigs.resultChains")
                );
            });

            it("should not call assignment repository", async () => {
                // Arrange
                const incompleteAppConfigs = createMockAppConfigs({
                    memoryExpirationMinutes: undefined,
                });
                const consumerWithIncompleteConfig = new UserChainConsumer({
                    gameData: mockGameData,
                    assignmentRepository: mockAssignmentRepository,
                    logService: mockLogService,
                    appConfigs: incompleteAppConfigs,
                });

                // Act
                await consumerWithIncompleteConfig.loadActive();

                // Assert
                expect(mockAssignmentRepository.find).not.toHaveBeenCalled();
            });
        });

        describe("when loading active assignments from database", () => {
            it("should create player chain entries in memory", async () => {
                // Arrange
                const activeAssignments = [
                    createActiveAssignment({
                        playerName: "activePlayer1",
                        chainName: "discovery-75boards-01",
                        currentBoardIndex: 1,
                        betLevel: 1,
                        coinValue: 0.1,
                    }),
                ];

                mockAssignmentRepository.find.mockReturnValue({
                    sort: jest.fn().mockReturnValue({
                        limit: jest.fn().mockReturnValue({
                            lean: jest.fn().mockReturnValue({
                                exec: jest.fn().mockResolvedValue(activeAssignments),
                            }),
                        }),
                    }),
                });

                // Act
                await userChainConsumer.loadActive();

                // Assert
                expect(mockGameData.playerChains["activePlayer1-0.10"]).toBeDefined();
            });

            it("should set correct chain name from assignment", async () => {
                // Arrange
                const activeAssignments = [
                    createActiveAssignment({
                        playerName: "activePlayer1",
                        chainName: "discovery-75boards-01",
                    }),
                ];

                mockAssignmentRepository.find.mockReturnValue({
                    sort: jest.fn().mockReturnValue({
                        limit: jest.fn().mockReturnValue({
                            lean: jest.fn().mockReturnValue({
                                exec: jest.fn().mockResolvedValue(activeAssignments),
                            }),
                        }),
                    }),
                });

                // Act
                await userChainConsumer.loadActive();

                // Assert
                expect(mockGameData.playerChains["activePlayer1-0.10"].name).toBe("discovery-75boards-01");
            });

            it("should set correct current index from assignment", async () => {
                // Arrange
                const activeAssignments = [
                    createActiveAssignment({
                        playerName: "activePlayer1",
                        currentBoardIndex: 5,
                    }),
                ];

                mockAssignmentRepository.find.mockReturnValue({
                    sort: jest.fn().mockReturnValue({
                        limit: jest.fn().mockReturnValue({
                            lean: jest.fn().mockReturnValue({
                                exec: jest.fn().mockResolvedValue(activeAssignments),
                            }),
                        }),
                    }),
                });

                // Act
                await userChainConsumer.loadActive();

                // Assert
                expect(mockGameData.playerChains["activePlayer1-0.10"].currentIndex).toBe(5);
            });

            it("should set correct bet level from assignment", async () => {
                // Arrange
                const activeAssignments = [
                    createActiveAssignment({
                        playerName: "activePlayer1",
                        betLevel: 3,
                        coinValue: 0.3, // Adjust coinValue to match betLevel for consistent key
                    }),
                ];

                mockAssignmentRepository.find.mockReturnValue({
                    sort: jest.fn().mockReturnValue({
                        limit: jest.fn().mockReturnValue({
                            lean: jest.fn().mockReturnValue({
                                exec: jest.fn().mockResolvedValue(activeAssignments),
                            }),
                        }),
                    }),
                });

                // Act
                await userChainConsumer.loadActive();

                // Assert
                expect(mockGameData.playerChains["activePlayer1-0.90"].betLevel).toBe(3);
            });

            it("should set correct coin value from assignment", async () => {
                // Arrange
                const activeAssignments = [
                    createActiveAssignment({
                        playerName: "activePlayer1",
                        coinValue: 0.5,
                    }),
                ];

                mockAssignmentRepository.find.mockReturnValue({
                    sort: jest.fn().mockReturnValue({
                        limit: jest.fn().mockReturnValue({
                            lean: jest.fn().mockReturnValue({
                                exec: jest.fn().mockResolvedValue(activeAssignments),
                            }),
                        }),
                    }),
                });

                // Act
                await userChainConsumer.loadActive();

                // Assert
                expect(mockGameData.playerChains["activePlayer1-0.50"].coinValue).toBe(0.5);
            });
        });

        it("should skip chains not found in available chains", async () => {
            // Arrange
            const activeAssignments = [
                createActiveAssignment({
                    playerName: "missingChainPlayer",
                    chainName: "non-existent-chain",
                }),
            ];

            mockAssignmentRepository.find.mockReturnValue({
                sort: jest.fn().mockReturnValue({
                    limit: jest.fn().mockReturnValue({
                        lean: jest.fn().mockReturnValue({
                            exec: jest.fn().mockResolvedValue(activeAssignments),
                        }),
                    }),
                }),
            });

            // Act
            await userChainConsumer.loadActive();

            // Assert
            expect(mockGameData.playerChains["missingChainPlayer-0.10"]).toBeUndefined();
        });

        it("should log error when database operation fails", async () => {
            // Arrange
            mockAssignmentRepository.find.mockReturnValue({
                sort: jest.fn().mockReturnValue({
                    limit: jest.fn().mockReturnValue({
                        lean: jest.fn().mockReturnValue({
                            exec: jest.fn().mockRejectedValue(new Error("Database error")),
                        }),
                    }),
                }),
            });

            // Act
            await userChainConsumer.loadActive();

            // Assert
            expect(mockLogService.logError).toHaveBeenCalledWith("Failed to load active chains:", expect.any(Error));
        });
    });

    describe("assignChain", () => {
        describe("when assignment is successful", () => {
            it("should return true", async () => {
                // Arrange
                const playerContext = createPlayerContext({ balance: 120 });

                // Act
                const result = await userChainConsumer.assignChain("testPlayer", playerContext);

                // Assert
                expect(result).toBe(true);
            });

            it("should create player chain entry in memory", async () => {
                // Arrange
                const playerContext = createPlayerContext({ balance: 120 });

                // Act
                await userChainConsumer.assignChain("testPlayer", playerContext);

                // Assert
                expect(mockGameData.playerChains["testPlayer-0.10"]).toBeDefined();
            });

            it("should set initial current index to zero", async () => {
                // Arrange
                const playerContext = createPlayerContext({ balance: 120 });

                // Act
                await userChainConsumer.assignChain("testPlayer", playerContext);

                // Assert
                expect(mockGameData.playerChains["testPlayer-0.10"].currentIndex).toBe(0);
            });

            it("should set correct bet level from context", async () => {
                // Arrange
                // For betLevel 3, coinValue 0.1: chainKey = "testPlayer-0.30"
                // Need balance that gives applicable board count matching available chains (50 or 75)
                // playableBoards = floor(balance / (3 * 0.1) / 20) = floor(balance / 6)
                // For 75 boards: need balance around 360 (floor(360/6) = 60, applicableBoards = 75, closest = 75)
                const playerContext = createPlayerContext({ betLevel: 3, balance: 360 });

                // Act
                await userChainConsumer.assignChain("testPlayer", playerContext);

                // Assert
                expect(mockGameData.playerChains["testPlayer-0.30"].betLevel).toBe(3);
            });

            it("should set correct coin value from context", async () => {
                // Arrange
                // For betLevel 1, coinValue 0.5: chainKey = "testPlayer-0.50"
                // playableBoards = floor(balance / (1 * 0.5) / 20) = floor(balance / 10)
                // For 75 boards: need balance around 600 (floor(600/10) = 60, applicableBoards = 75, closest = 75)
                const playerContext = createPlayerContext({ coinValue: 0.5, balance: 600 });

                // Act
                await userChainConsumer.assignChain("testPlayer", playerContext);

                // Assert
                expect(mockGameData.playerChains["testPlayer-0.50"].coinValue).toBe(0.5);
            });

            it("should call assignment repository create", async () => {
                // Arrange
                const playerContext = createPlayerContext({ balance: 120 });

                // Act
                await userChainConsumer.assignChain("testPlayer", playerContext);

                // Assert
                expect(mockAssignmentRepository.create).toHaveBeenCalled();
            });
        });

        describe("when chains are disabled", () => {
            it("should return false", async () => {
                // Arrange
                mockGameData.gameConfigs.cascadingSlotsConfig.resultChains.enabled = false;
                const playerContext = createPlayerContext({ balance: 120 });

                // Act
                const result = await userChainConsumer.assignChain("testPlayer", playerContext);

                // Assert
                expect(result).toBe(false);
            });

            it("should not call assignment repository", async () => {
                // Arrange
                mockGameData.gameConfigs.cascadingSlotsConfig.resultChains.enabled = false;
                const playerContext = createPlayerContext({ balance: 120 });

                // Act
                await userChainConsumer.assignChain("testPlayer", playerContext);

                // Assert
                expect(mockAssignmentRepository.create).not.toHaveBeenCalled();
            });
        });

        it("should return false when player already has an active chain", async () => {
            // Arrange
            mockGameData.playerChains["existingPlayer-0.10"] = {
                name: "existing-chain",
                currentIndex: 0,
                totalBoards: 100,
            };
            const playerContext = createPlayerContext({ balance: 120 });

            // Act
            const result = await userChainConsumer.assignChain("existingPlayer", playerContext);

            // Assert
            expect(result).toBe(false);
        });

        it("should return false when player has active assignment in database", async () => {
            // Mock assignmentRepository to return an active assignment
            mockAssignmentRepository.findOne.mockReturnValueOnce({
                lean: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue({
                        playerName: "existingPlayer",
                        betLevel: 1,
                        coinValue: 0.1,
                        status: "active",
                    }),
                }),
            });

            const result = await userChainConsumer.assignChain("existingPlayer", {
                betLevel: 1,
                coinValue: 0.1,
                balance: 120,
            });

            expect(result).toBe(false);
            expect(mockAssignmentRepository.create).not.toHaveBeenCalled();
        });

        it("should return false when no chains are available", async () => {
            mockGameData.availableChains = [];

            const result = await userChainConsumer.assignChain("testPlayer", {
                betLevel: 1,
                coinValue: 0.1,
                balance: 120,
            });

            expect(result).toBe(false);
            // No warning should be logged since missing chains are handled silently
        });

        it("should use random selection when multiple chains are available", async () => {
            // Temporarily modify available chains to have multiple chains with same totalBoardCount
            const originalChains = mockGameData.availableChains;
            mockGameData.availableChains = [
                { name: "discovery-75boards-01", baseBetAmount: 0.1, totalBoardCount: 75 },
                { name: "cliffhanger-75boards-01", baseBetAmount: 0.1, totalBoardCount: 75 }, // Same board count
            ];

            // Mock selectRandom to return the second chain
            const selectRandomSpy = jest.spyOn(userChainConsumer, "selectRandom").mockReturnValue({
                name: "cliffhanger-75boards-01",
                baseBetAmount: 0.1,
                totalBoardCount: 75,
            });

            // Adjust balance so getApplicableBoardCount returns 75 (matches both chains)
            // playableBoards = floor(120 / 0.1 / 20) = 60, applicableBoards = 75, closest = 75
            const result = await userChainConsumer.assignChain("randomTestPlayer", {
                playerId: "randomTestPlayer",
                betLevel: 1,
                coinValue: 0.1,
                balance: 120, // This gives us 75 applicable boards
            });

            expect(result).toBe(true);
            expect(mockGameData.playerChains["randomTestPlayer-0.10"].name).toBe("cliffhanger-75boards-01");

            // Restore original chains
            mockGameData.availableChains = originalChains;
            selectRandomSpy.mockRestore();
        });

        it("should assign chain regardless of betLevel and coinValue (no filtering)", async () => {
            // Mock selectRandom to return the first chain
            const selectRandomSpy = jest.spyOn(userChainConsumer, "selectRandom").mockReturnValue({
                name: "discovery-75boards-01",
                baseBetAmount: 0.1,
                totalBoardCount: 75,
            });

            const result = await userChainConsumer.assignChain("noFilterTestPlayer", {
                playerId: "noFilterTestPlayer",
                betLevel: 1,
                coinValue: 0.1,
                balance: 120,
                operatorId: "test-operator",
                gameId: "test-game",
                currency: "USD",
            });

            expect(result).toBe(true);
            // Should not query assignments for filtering - assignChain no longer does this
            expect(mockGameData.playerChains["noFilterTestPlayer-0.10"].name).toBe("discovery-75boards-01");

            selectRandomSpy.mockRestore();
        });

        it("should return false when player balance is insufficient", async () => {
            const result = await userChainConsumer.assignChain("poorPlayer", {
                playerId: "poorPlayer",
                betLevel: 1,
                coinValue: 0.1,
                balance: 0,
            });

            expect(result).toBe(false);
        });

        it("should return false when baseBetAmount is zero", async () => {
            const result = await userChainConsumer.assignChain("zeroPlayer", {
                playerId: "zeroPlayer",
                betLevel: 0,
                coinValue: 0.1,
                balance: 100,
            });

            expect(result).toBe(false);
        });

        it("should handle assignment repository errors gracefully", async () => {
            mockAssignmentRepository.create.mockRejectedValueOnce(new Error("Database error"));

            // Use balance that matches discovery-75boards-01 (75 boards)
            // playableBoards = floor(120 / 0.1 / 20) = 60, applicableBoards = 75, closest = 75
            const result = await userChainConsumer.assignChain("errorTestPlayer", {
                playerId: "errorTestPlayer",
                betLevel: 1,
                coinValue: 0.1,
                balance: 120, // This should match discovery-75boards-01 with 75 boards
            });

            expect(result).toBe(true); // Assignment to memory should still succeed
            expect(mockLogService.logError).toHaveBeenCalledWith(expect.stringContaining("Failed to create chain assignment for errorTestPlayer"));
        });
    });

    describe("updateChainProgress", () => {
        beforeEach(() => {
            mockGameData.playerChains["progressPlayer-0.10"] = {
                name: "discovery-75boards-01",
                boards: [{ board: [1, 2, 3] }, { board: [4, 5, 6] }],
                currentIndex: 0,
                totalBoards: 2,
                betLevel: 1,
                coinValue: 0.1,
                playerName: "progressPlayer",
            };
        });

        it("should update chain progress successfully", async () => {
            const updatedAssignment = {
                _id: "assignment-123",
                playerName: "progressPlayer",
                chainName: "discovery-75boards-01",
                status: "active",
                currentBoardIndex: 1,
                totalBoards: 2,
            };

            mockAssignmentRepository.findOneAndUpdate.mockResolvedValue(updatedAssignment);

            const result = await userChainConsumer.updateChainProgress({
                playerId: "player-123",
                playerName: "progressPlayer",
                betLevel: 1,
                coinValue: 0.1,
                roundBetAmount: 10,
                roundWinAmount: 15,
            });

            expect(result).toEqual(updatedAssignment);
            expect(mockGameData.playerChains["progressPlayer-0.10"].currentIndex).toBe(1);
            expect(mockAssignmentRepository.findOneAndUpdate).toHaveBeenCalledWith(
                {
                    playerId: "player-123",
                    chainName: "discovery-75boards-01",
                    status: "active",
                    gameId: "test-game-123",
                },
                {
                    $inc: {
                        currentBoardIndex: 1,
                        totalBetAmount: 10,
                        totalWinAmount: 15,
                    },
                    $set: {
                        lastActivityAt: expect.any(Date),
                    },
                },
                { new: true }
            );
        });

        it("should complete chain when reaching total boards", async () => {
            mockGameData.playerChains["completionPlayer-0.10"] = {
                name: "discovery-75boards-01",
                boards: [{ board: [1, 2, 3] }],
                currentIndex: 0,
                totalBoards: 1,
                betLevel: 1,
                coinValue: 0.1,
                playerName: "completionPlayer",
            };

            const completedAssignment = {
                _id: "assignment-123",
                playerName: "completionPlayer",
                chainName: "discovery-75boards-01",
                status: "completed",
                currentBoardIndex: 1,
                totalBoards: 1,
                totalWinAmount: 100,
                totalBetAmount: 50,
            };

            mockAssignmentRepository.findOneAndUpdate.mockResolvedValue(completedAssignment);

            const result = await userChainConsumer.updateChainProgress({
                playerId: "player-123",
                playerName: "completionPlayer",
                betLevel: 1,
                coinValue: 0.1,
                roundBetAmount: 10,
                roundWinAmount: 15,
            });

            expect(result).toEqual(completedAssignment);
            expect(mockGameData.playerChains["completionPlayer-0.10"]).toBeUndefined();
            // No completion log since it's handled silently
        });

        it("should return null when player chain not found", async () => {
            const result = await userChainConsumer.updateChainProgress({
                playerId: "player-123",
                playerName: "nonExistentPlayer",
                betLevel: 1,
                coinValue: 0.1,
            });

            expect(result).toBeNull();
            // No warning should be logged since missing chains are normal
        });

        it("should return null when no active assignment found in database", async () => {
            mockAssignmentRepository.findOneAndUpdate.mockResolvedValue(null);

            const result = await userChainConsumer.updateChainProgress({
                playerId: "player-123",
                playerName: "progressPlayer",
                betLevel: 1,
                coinValue: 0.1,
            });

            expect(result).toBeNull();
            // No warning should be logged since missing assignments are normal
        });

        it("should handle database errors gracefully", async () => {
            mockAssignmentRepository.findOneAndUpdate.mockRejectedValue(new Error("Update error"));

            const result = await userChainConsumer.updateChainProgress({
                playerId: "player-123",
                playerName: "progressPlayer",
                betLevel: 1,
                coinValue: 0.1,
            });

            expect(result).toBeNull();
            expect(mockLogService.logError).toHaveBeenCalledWith(expect.stringContaining("Failed to update chain progress for progressPlayer"));
        });
    });

    describe("findChainsByBet", () => {
        it("should return matching chain names", async () => {
            mockAssignmentRepository.find.mockReturnValue({
                lean: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue([
                        { chainName: "discovery-75boards-01" },
                        { chainName: "wave-50boards-01" },
                        { chainName: "discovery-75boards-01" }, // duplicate to test Set uniqueness
                    ]),
                }),
            });

            const result = await userChainConsumer.findChainsByBet(1, 0.1);

            expect(result).toEqual(["discovery-75boards-01", "wave-50boards-01"]);
            expect(mockAssignmentRepository.find).toHaveBeenCalledWith(
                {
                    betLevel: 1,
                    coinValue: 0.1,
                    status: "active",
                    gameId: "test-game-123",
                },
                { chainName: 1, _id: 0 }
            );
        });

        it("should return empty array on database error", async () => {
            mockAssignmentRepository.find.mockReturnValue({
                lean: jest.fn().mockReturnValue({
                    exec: jest.fn().mockRejectedValue(new Error("Database error")),
                }),
            });

            const result = await userChainConsumer.findChainsByBet(1, 0.1);

            expect(result).toEqual([]);
            expect(mockLogService.logError).toHaveBeenCalledWith(expect.stringContaining("Failed to find chains by bet params"));
        });
    });

    describe("getApplicableBoardCount", () => {
        it("should log error and return -1 when chain configuration is missing", () => {
            const incompleteAppConfigs = {
                resultChains: {
                    maxChains: 300,
                    maxPlayerChains: 300,
                    memoryExpirationMinutes: 30,
                    // Missing assignment configuration
                },
            };

            const consumerWithIncompleteConfig = new UserChainConsumer({
                gameData: mockGameData,
                assignmentRepository: mockAssignmentRepository,
                logService: mockLogService,
                appConfigs: incompleteAppConfigs,
            });

            const result = consumerWithIncompleteConfig.getApplicableBoardCount({ balance: 1000 }, 10);

            expect(result).toBe(-1);
            expect(mockLogService.logError).toHaveBeenCalledWith(
                expect.stringContaining("missing configuration in appConfigs.resultChains.assignment")
            );
        });

        it("should return -1 immediately for zero balance", () => {
            const result = userChainConsumer.getApplicableBoardCount({ balance: 0 }, 0.1);
            expect(result).toBe(-1);
        });

        it("should return -1 for zero baseBetAmount", () => {
            const result = userChainConsumer.getApplicableBoardCount({ balance: 100 }, 0);
            expect(result).toBe(-1);
        });

        it("should return -1 for negative values", () => {
            const result1 = userChainConsumer.getApplicableBoardCount({ balance: -10 }, 0.1);
            const result2 = userChainConsumer.getApplicableBoardCount({ balance: 100 }, -0.1);
            expect(result1).toBe(-1);
            expect(result2).toBe(-1);
        });

        it("should calculate board count using betMultiplier from gameConfigs", () => {
            mockGameData.gameConfigs.cascadingSlotsConfig.betMultiplier = 20;

            const result = userChainConsumer.getApplicableBoardCount({ balance: 120 }, 0.1);

            // playableBoards = floor(120 / 0.1 / 20) = floor(60) = 60
            // applicableBoards = floor(60 + 15) = 75
            // 75 <= 100 (maximum), closest valid = 75
            expect(result).toBe(75);
        });

        it("should return -1 when playable boards less than 50", () => {
            mockGameData.gameConfigs.cascadingSlotsConfig.betMultiplier = 20;

            const result = userChainConsumer.getApplicableBoardCount({ balance: 50 }, 0.1);

            // playableBoards = floor(50 / 0.1 / 20) = floor(25) = 25
            // Since 25 < 50 (minimum), should return -1
            expect(result).toBe(-1);
        });

        it("should apply chain when playable boards equals exactly 50", () => {
            mockGameData.gameConfigs.cascadingSlotsConfig.betMultiplier = 20;

            const result = userChainConsumer.getApplicableBoardCount({ balance: 100 }, 0.1);

            // playableBoards = floor(100 / 0.1 / 20) = floor(50) = 50
            // applicableBoards = floor(50 + 12.5) = 62
            // Valid counts: [50, 75, 100, 125, 150, 175, 200]
            // Distance from 62: |50-62|=12, |75-62|=13, so closest is 50
            expect(result).toBe(50);
        });

        it("should calculate board count and round to nearest valid count", () => {
            mockGameData.gameConfigs.cascadingSlotsConfig.betMultiplier = 20;

            // Test different scenarios with new formula
            const result1 = userChainConsumer.getApplicableBoardCount({ balance: 120 }, 0.1);
            // playableBoards = floor(120 / 0.1 / 20) = 60, applicableBoards = 75, closest valid = 75
            expect(result1).toBe(75);

            const result2 = userChainConsumer.getApplicableBoardCount({ balance: 160 }, 0.1);
            // playableBoards = floor(160 / 0.1 / 20) = 80, applicableBoards = 100, closest valid = 100
            expect(result2).toBe(100);

            // Test with larger balance
            const result3 = userChainConsumer.getApplicableBoardCount({ balance: 1000 }, 0.1);
            // playableBoards = floor(1000 / 0.1 / 20) = 500, applicableBoards = 625, exceeds max (200) = -1
            expect(result3).toBe(-1);
        });

        it("should use default betMultiplier when not configured", () => {
            delete mockGameData.gameConfigs.cascadingSlotsConfig.betMultiplier;

            const result = userChainConsumer.getApplicableBoardCount({ balance: 80 }, 1);

            // Should use default multiplier of 1
            // playableBoards = floor(80 / 1 / 1) = 80, applicableBoards = 100, closest valid = 100
            expect(result).toBe(100);
        });
    });

    describe("getPlayableBoards", () => {
        it("should return -1 for invalid inputs", () => {
            expect(userChainConsumer.getPlayableBoards(0, 1, 1)).toBe(-1);
            expect(userChainConsumer.getPlayableBoards(-10, 1, 1)).toBe(-1);
            expect(userChainConsumer.getPlayableBoards(100, 0, 1)).toBe(-1);
            expect(userChainConsumer.getPlayableBoards(100, -1, 1)).toBe(-1);
        });

        it("should calculate playable boards correctly", () => {
            expect(userChainConsumer.getPlayableBoards(100, 1, 1)).toBe(100);
            expect(userChainConsumer.getPlayableBoards(100, 2, 1)).toBe(50);
            expect(userChainConsumer.getPlayableBoards(100, 1, 2)).toBe(50);
            expect(userChainConsumer.getPlayableBoards(150, 1.5, 2)).toBe(50);
        });

        it("should handle decimal calculations with Math.floor", () => {
            expect(userChainConsumer.getPlayableBoards(99, 1, 1)).toBe(99);
            expect(userChainConsumer.getPlayableBoards(99.9, 1, 1)).toBe(99);
            expect(userChainConsumer.getPlayableBoards(100, 3, 1)).toBe(33); // 100/3 = 33.33 -> 33
        });
    });

    describe("getApplicableBoards", () => {
        it("should return -1 when configuration is missing", () => {
            const incompleteAppConfigs = {
                resultChains: {
                    maxChains: 300,
                    maxPlayerChains: 300,
                    memoryExpirationMinutes: 30,
                    // Missing assignment configuration
                },
            };

            const consumerWithIncompleteConfig = new UserChainConsumer({
                gameData: mockGameData,
                assignmentRepository: mockAssignmentRepository,
                logService: mockLogService,
                appConfigs: incompleteAppConfigs,
            });

            const result = consumerWithIncompleteConfig.getApplicableBoards(50);
            expect(result).toBe(-1);
            expect(mockLogService.logError).toHaveBeenCalledWith(
                expect.stringContaining("missing configuration in appConfigs.resultChains.assignment")
            );
        });

        it("should return -1 for playable boards less than minimum threshold", () => {
            expect(userChainConsumer.getApplicableBoards(-1)).toBe(-1);
            expect(userChainConsumer.getApplicableBoards(0)).toBe(-1);
            expect(userChainConsumer.getApplicableBoards(10)).toBe(-1);
            expect(userChainConsumer.getApplicableBoards(49)).toBe(-1);
        });

        it("should calculate applicable boards using 25% formula", () => {
            expect(userChainConsumer.getApplicableBoards(50)).toBe(62); // 50 + 12.5 = 62.5 -> 62
            expect(userChainConsumer.getApplicableBoards(100)).toBe(125); // 100 + 25 = 125
            expect(userChainConsumer.getApplicableBoards(80)).toBe(100); // 80 + 20 = 100
            expect(userChainConsumer.getApplicableBoards(200)).toBe(250); // 200 + 50 = 250
        });

        it("should handle decimal calculations with Math.floor", () => {
            expect(userChainConsumer.getApplicableBoards(51)).toBe(63); // 51 + 12.75 = 63.75 -> 63
            expect(userChainConsumer.getApplicableBoards(83)).toBe(103); // 83 + 20.75 = 103.75 -> 103
        });
    });

    describe("getClosestValidBoardCount", () => {
        it("should return closest valid board count", () => {
            expect(userChainConsumer.getClosestValidBoardCount(50)).toBe(50);
            expect(userChainConsumer.getClosestValidBoardCount(62)).toBe(50); // |50-62|=12, |75-62|=13
            expect(userChainConsumer.getClosestValidBoardCount(63)).toBe(75); // |50-63|=13, |75-63|=12
            expect(userChainConsumer.getClosestValidBoardCount(75)).toBe(75);
            expect(userChainConsumer.getClosestValidBoardCount(87)).toBe(75); // |75-87|=12, |100-87|=13
            expect(userChainConsumer.getClosestValidBoardCount(88)).toBe(100); // |75-88|=13, |100-88|=12
            expect(userChainConsumer.getClosestValidBoardCount(100)).toBe(100);
            expect(userChainConsumer.getClosestValidBoardCount(112)).toBe(100); // |100-112|=12, |125-112|=13
            expect(userChainConsumer.getClosestValidBoardCount(113)).toBe(125); // |100-113|=13, |125-113|=12
            expect(userChainConsumer.getClosestValidBoardCount(125)).toBe(125);
            expect(userChainConsumer.getClosestValidBoardCount(200)).toBe(200); // Max value
        });

        it("should handle edge cases", () => {
            expect(userChainConsumer.getClosestValidBoardCount(0)).toBe(50); // Closest to minimum
            expect(userChainConsumer.getClosestValidBoardCount(87.5)).toBe(75); // |75-87.5|=12.5, |100-87.5|=12.5, returns first (75)
        });

        it("should return -1 when applicableBoards exceeds maximum board range", () => {
            // Arrange & Act & Assert
            expect(userChainConsumer.getClosestValidBoardCount(250)).toBe(-1); // 250 > 200 (max)
            expect(userChainConsumer.getClosestValidBoardCount(1000)).toBe(-1); // 1000 > 200 (max)
        });
    });

    describe("sortByActivity", () => {
        beforeEach(() => {
            const now = new Date();
            mockGameData.playerChains = {
                "player1-0.10": {
                    lastActivityAt: new Date(now.getTime() - 1000), // 1 second ago
                    assignedAt: new Date(now.getTime() - 5000),
                },
                "player2-0.20": {
                    lastActivityAt: new Date(now.getTime() - 3000), // 3 seconds ago
                    assignedAt: new Date(now.getTime() - 4000),
                },
                "player3-0.30": {
                    // No lastActivityAt, should use assignedAt
                    assignedAt: new Date(now.getTime() - 2000), // 2 seconds ago
                },
            };
        });

        it("should sort chains by most recent activity first", () => {
            const chainKeys = ["player1-0.10", "player2-0.20", "player3-0.30"];
            const sorted = userChainConsumer.sortByActivity(chainKeys);

            // Expected order: player1 (1s ago) -> player3 (2s ago) -> player2 (3s ago)
            expect(sorted).toEqual(["player1-0.10", "player3-0.30", "player2-0.20"]);
        });

        it("should handle empty array", () => {
            const sorted = userChainConsumer.sortByActivity([]);
            expect(sorted).toEqual([]);
        });

        it("should handle single item", () => {
            const sorted = userChainConsumer.sortByActivity(["player1-0.10"]);
            expect(sorted).toEqual(["player1-0.10"]);
        });

        it("should fallback to assignedAt when lastActivityAt is missing", () => {
            const now = new Date();
            mockGameData.playerChains = {
                "player1-0.10": {
                    assignedAt: new Date(now.getTime() - 1000), // 1 second ago
                },
                "player2-0.20": {
                    assignedAt: new Date(now.getTime() - 3000), // 3 seconds ago
                },
            };

            const sorted = userChainConsumer.sortByActivity(["player1-0.10", "player2-0.20"]);
            expect(sorted).toEqual(["player1-0.10", "player2-0.20"]);
        });
    });

    describe("limitPerPlayer", () => {
        beforeEach(() => {
            const now = new Date();
            mockGameData.playerChains = {
                "testPlayer-0.10": {
                    lastActivityAt: new Date(now.getTime() - 1000),
                    assignedAt: new Date(now.getTime() - 5000),
                },
                "testPlayer-0.20": {
                    lastActivityAt: new Date(now.getTime() - 3000),
                    assignedAt: new Date(now.getTime() - 4000),
                },
                "testPlayer-0.30": {
                    lastActivityAt: new Date(now.getTime() - 2000),
                    assignedAt: new Date(now.getTime() - 3000),
                },
                "otherPlayer-0.10": {
                    lastActivityAt: new Date(now.getTime() - 1500),
                    assignedAt: new Date(now.getTime() - 2000),
                },
                "otherPlayer-0.20": {
                    lastActivityAt: new Date(now.getTime() - 4000),
                    assignedAt: new Date(now.getTime() - 6000),
                },
                "otherPlayer-0.30": {
                    lastActivityAt: new Date(now.getTime() - 5000),
                    assignedAt: new Date(now.getTime() - 7000),
                },
            };
        });

        it("should not remove chains when all players have less than limit", () => {
            // Remove chains to have only 1 per player
            delete mockGameData.playerChains["testPlayer-0.20"];
            delete mockGameData.playerChains["testPlayer-0.30"];
            delete mockGameData.playerChains["otherPlayer-0.20"];
            delete mockGameData.playerChains["otherPlayer-0.30"];

            userChainConsumer.limitPerPlayer();

            // Should not affect existing chains
            expect(Object.keys(mockGameData.playerChains)).toHaveLength(2);
        });

        it("should remove oldest chains when players exceed limit", () => {
            userChainConsumer.limitPerPlayer();

            // Should keep only 2 most recent chains per player
            const testPlayerChains = Object.keys(mockGameData.playerChains).filter((key) => key.startsWith("testPlayer-"));
            const otherPlayerChains = Object.keys(mockGameData.playerChains).filter((key) => key.startsWith("otherPlayer-"));

            expect(testPlayerChains).toHaveLength(2);
            expect(otherPlayerChains).toHaveLength(2);

            // Should keep most recent for testPlayer: testPlayer-0.10 (1s ago) and testPlayer-0.30 (2s ago)
            expect(mockGameData.playerChains["testPlayer-0.10"]).toBeDefined();
            expect(mockGameData.playerChains["testPlayer-0.30"]).toBeDefined();
            expect(mockGameData.playerChains["testPlayer-0.20"]).toBeUndefined(); // Oldest (3s ago)

            // Should keep most recent for otherPlayer: otherPlayer-0.10 (1.5s ago) and otherPlayer-0.20 (4s ago)
            expect(mockGameData.playerChains["otherPlayer-0.10"]).toBeDefined();
            expect(mockGameData.playerChains["otherPlayer-0.20"]).toBeDefined();
            expect(mockGameData.playerChains["otherPlayer-0.30"]).toBeUndefined(); // Oldest (5s ago)
        });

        it("should handle players with exactly the limit", () => {
            // Remove one chain per player to have exactly 2 each
            delete mockGameData.playerChains["testPlayer-0.30"];
            delete mockGameData.playerChains["otherPlayer-0.30"];

            userChainConsumer.limitPerPlayer();

            // Should keep both chains for each player
            expect(mockGameData.playerChains["testPlayer-0.10"]).toBeDefined();
            expect(mockGameData.playerChains["testPlayer-0.20"]).toBeDefined();
            expect(mockGameData.playerChains["otherPlayer-0.10"]).toBeDefined();
            expect(mockGameData.playerChains["otherPlayer-0.20"]).toBeDefined();
        });
    });

    describe("clean", () => {
        describe("when chains are disabled", () => {
            it("should return early without cleaning chains", () => {
                // Arrange
                mockGameData.gameConfigs.cascadingSlotsConfig.resultChains.enabled = false;
                const now = new Date();
                const expiredTime = now.getTime() - 31 * 60 * 1000; // 31 minutes ago (expired)
                mockGameData.playerChains = {
                    "expired1-0.10": {
                        lastActivityAt: new Date(expiredTime),
                        assignedAt: new Date(expiredTime),
                    },
                };

                // Act
                userChainConsumer.clean();

                // Assert
                expect(mockGameData.playerChains["expired1-0.10"]).toBeDefined();
            });

            it("should not call cleanExpired or limitPerPlayer or enforceGlobalLimit", () => {
                // Arrange
                mockGameData.gameConfigs.cascadingSlotsConfig.resultChains.enabled = false;
                const cleanExpiredSpy = jest.spyOn(userChainConsumer, "cleanExpired");
                const limitPerPlayerSpy = jest.spyOn(userChainConsumer, "limitPerPlayer");
                const enforceGlobalLimitSpy = jest.spyOn(userChainConsumer, "enforceGlobalLimit");

                // Act
                userChainConsumer.clean();

                // Assert
                expect(cleanExpiredSpy).not.toHaveBeenCalled();
                expect(limitPerPlayerSpy).not.toHaveBeenCalled();
                expect(enforceGlobalLimitSpy).not.toHaveBeenCalled();
            });
        });

        it("should return early when memoryExpirationMinutes is not configured", () => {
            // Create consumer with missing memoryExpirationMinutes config
            const incompleteAppConfigs = {
                resultChains: {
                    maxChains: 300,
                    maxPlayerChains: 300,
                    // memoryExpirationMinutes is missing
                },
            };

            const consumerWithIncompleteConfig = new UserChainConsumer({
                gameData: mockGameData,
                assignmentRepository: mockAssignmentRepository,
                logService: mockLogService,
                appConfigs: incompleteAppConfigs,
            });

            // Should not throw an error, just return early
            expect(() => consumerWithIncompleteConfig.clean()).not.toThrow();
        });

        beforeEach(() => {
            const now = new Date();
            const expiredTime = now.getTime() - 31 * 60 * 1000; // 31 minutes ago (expired)
            const recentTime = now.getTime() - 10 * 60 * 1000; // 10 minutes ago (not expired)

            mockGameData.playerChains = {
                "expired1-0.10": {
                    lastActivityAt: new Date(expiredTime),
                    assignedAt: new Date(expiredTime),
                },
                "expired2-0.20": {
                    assignedAt: new Date(expiredTime), // No lastActivityAt, uses assignedAt
                },
                "recent1-0.10": {
                    lastActivityAt: new Date(recentTime),
                    assignedAt: new Date(recentTime),
                },
                "recent2-0.20": {
                    lastActivityAt: new Date(recentTime),
                    assignedAt: new Date(recentTime),
                },
            };
        });

        it("should remove expired chains", () => {
            userChainConsumer.clean();

            expect(mockGameData.playerChains["expired1-0.10"]).toBeUndefined();
            expect(mockGameData.playerChains["expired2-0.20"]).toBeUndefined();
            expect(mockGameData.playerChains["recent1-0.10"]).toBeDefined();
            expect(mockGameData.playerChains["recent2-0.20"]).toBeDefined();
        });

        it("should enforce global cache limit after cleaning expired chains", () => {
            // Create many non-expired chains to exceed global limit
            const now = new Date();
            const recentTime = now.getTime() - 10 * 60 * 1000;

            // Clear existing chains and create 302 chains (exceeds limit of 300)
            mockGameData.playerChains = {};
            for (let i = 0; i < 302; i++) {
                mockGameData.playerChains[`player${i}-0.10`] = {
                    lastActivityAt: new Date(recentTime - i * 1000), // Different times for sorting
                    assignedAt: new Date(recentTime - i * 1000),
                };
            }

            userChainConsumer.clean();

            // Should keep only 300 most recent chains
            expect(Object.keys(mockGameData.playerChains)).toHaveLength(300);

            // Should keep the most recent ones (player0, player1, etc.)
            expect(mockGameData.playerChains["player0-0.10"]).toBeDefined();
            expect(mockGameData.playerChains["player299-0.10"]).toBeDefined();
            expect(mockGameData.playerChains["player300-0.10"]).toBeUndefined();
            expect(mockGameData.playerChains["player301-0.10"]).toBeUndefined();
        });

        it("should not enforce global limit when under threshold", () => {
            userChainConsumer.clean();

            // Should only remove expired chains, keep recent ones
            expect(Object.keys(mockGameData.playerChains)).toHaveLength(2);
            expect(mockGameData.playerChains["recent1-0.10"]).toBeDefined();
            expect(mockGameData.playerChains["recent2-0.20"]).toBeDefined();
        });
    });

    describe("findSuitable", () => {
        // Test setup utilities following DRY principles
        const createTestPlayerContext = (overrides = {}) => ({
            betLevel: 1,
            coinValue: 0.1,
            balance: 120,
            playerId: "test-player-123",
            operatorId: "test-operator",
            gameId: "test-game",
            currency: "USD",
            ...overrides,
        });

        const createTestChain = (overrides = {}) => ({
            name: "test-chain",
            baseBetAmount: 0.1,
            totalBoardCount: 75,
            ...overrides,
        });

        const createConsumerWithMocks = (mocks = {}) => {
            // Reset all mocks
            jest.clearAllMocks();

            // Apply custom mocks
            if (mocks.availableChains !== undefined) {
                mockGameData.availableChains = mocks.availableChains;
            }

            if (mocks.getApplicableBoardCount !== undefined) {
                jest.spyOn(userChainConsumer, "getApplicableBoardCount").mockReturnValue(mocks.getApplicableBoardCount);
            }

            if (mocks.calculateBaseBetAmount !== undefined) {
                jest.spyOn(userChainConsumer, "calculateBaseBetAmount").mockReturnValue(mocks.calculateBaseBetAmount);
            }

            if (mocks.filterChains !== undefined) {
                jest.spyOn(userChainConsumer, "filterChains").mockReturnValue(mocks.filterChains);
            }

            if (mocks.selectRandom !== undefined) {
                jest.spyOn(userChainConsumer, "selectRandom").mockReturnValue(mocks.selectRandom);
            }

            return userChainConsumer;
        };

        afterEach(() => {
            jest.restoreAllMocks();
        });

        describe("when applicable board count is -1", () => {
            it("should return null", async () => {
                // Arrange
                const playerContext = createTestPlayerContext({ balance: 0 });
                const consumer = createConsumerWithMocks({ getApplicableBoardCount: -1 });

                // Act
                const result = await consumer.findSuitable(playerContext);

                // Assert
                expect(result).toBeNull();
            });

            it("should not call filterChains", async () => {
                // Arrange
                const playerContext = createTestPlayerContext({ balance: 0 });
                const consumer = createConsumerWithMocks({ getApplicableBoardCount: -1 });
                const filterChainsSpy = jest.spyOn(consumer, "filterChains");

                // Act
                await consumer.findSuitable(playerContext);

                // Assert
                expect(filterChainsSpy).not.toHaveBeenCalled();
            });

            it("should not call selectRandom", async () => {
                // Arrange
                const playerContext = createTestPlayerContext({ balance: 0 });
                const consumer = createConsumerWithMocks({ getApplicableBoardCount: -1 });
                const selectRandomSpy = jest.spyOn(consumer, "selectRandom");

                // Act
                await consumer.findSuitable(playerContext);

                // Assert
                expect(selectRandomSpy).not.toHaveBeenCalled();
            });
        });

        describe("when no matching chains available", () => {
            it("should return null when no chains match exact board count", async () => {
                // Arrange
                const playerContext = createTestPlayerContext({ balance: 120 });
                const availableChains = [
                    createTestChain({ name: "chain1", totalBoardCount: 50 }),
                    createTestChain({ name: "chain2", totalBoardCount: 100 }),
                    createTestChain({ name: "chain3", totalBoardCount: 125 }),
                ];
                const consumer = createConsumerWithMocks({
                    availableChains,
                    getApplicableBoardCount: 75, // No chain has exactly 75 boards
                });

                // Act
                const result = await consumer.findSuitable(playerContext);

                // Assert
                expect(result).toBeNull();
            });

            it("should return null when available chains is empty", async () => {
                // Arrange
                const playerContext = createTestPlayerContext();
                const consumer = createConsumerWithMocks({
                    availableChains: [],
                    getApplicableBoardCount: 75,
                });

                // Act
                const result = await consumer.findSuitable(playerContext);

                // Assert
                expect(result).toBeNull();
            });

            it("should return null when available chains is undefined", async () => {
                // Arrange
                const playerContext = createTestPlayerContext();
                mockGameData.availableChains = undefined;
                const consumer = createConsumerWithMocks({ getApplicableBoardCount: 75 });

                // Act
                const result = await consumer.findSuitable(playerContext);

                // Assert
                expect(result).toBeNull();
            });
        });

        describe("when matching chains exist", () => {
            it("should return selected chain", async () => {
                // Arrange
                const playerContext = createTestPlayerContext();
                const expectedChain = createTestChain({ name: "matching-chain", totalBoardCount: 75 });
                const availableChains = [
                    createTestChain({ name: "chain1", totalBoardCount: 50 }),
                    expectedChain,
                    createTestChain({ name: "chain3", totalBoardCount: 100 }),
                ];
                const consumer = createConsumerWithMocks({
                    availableChains,
                    getApplicableBoardCount: 75, // Matches expectedChain exactly
                    cryptoRandomInt: 0, // Select first matching chain (index 0)
                });

                // Act
                const result = await consumer.findSuitable(playerContext);

                // Assert
                expect(result).toEqual(expectedChain);
            });

            it("should call calculateBaseBetAmount with correct parameters", async () => {
                // Arrange
                const playerContext = createTestPlayerContext({ betLevel: 5, coinValue: 0.2 });
                const consumer = createConsumerWithMocks({
                    availableChains: [createTestChain()],
                    getApplicableBoardCount: 75,
                });
                const calculateBaseBetSpy = jest.spyOn(consumer, "calculateBaseBetAmount");

                // Act
                await consumer.findSuitable(playerContext);

                // Assert
                expect(calculateBaseBetSpy).toHaveBeenCalledWith(5, 0.2);
            });

            it("should call getApplicableBoardCount with correct parameters", async () => {
                // Arrange
                const playerContext = createTestPlayerContext({ betLevel: 3, coinValue: 0.15 });
                const consumer = createConsumerWithMocks({
                    availableChains: [createTestChain()],
                    calculateBaseBetAmount: 0.45,
                });
                const getApplicableBoardCountSpy = jest.spyOn(consumer, "getApplicableBoardCount");

                // Act
                await consumer.findSuitable(playerContext);

                // Assert
                expect(getApplicableBoardCountSpy).toHaveBeenCalledWith(playerContext, 0.45);
            });

            it("should call filterChains with correct parameters", async () => {
                // Arrange
                const playerContext = createTestPlayerContext();
                const availableChains = [createTestChain(), createTestChain({ name: "chain2" })];
                const consumer = createConsumerWithMocks({
                    availableChains,
                    getApplicableBoardCount: 100,
                });
                const filterChainsSpy = jest.spyOn(consumer, "filterChains");

                // Act
                await consumer.findSuitable(playerContext);

                // Assert
                expect(filterChainsSpy).toHaveBeenCalledWith(availableChains, 100, null, null);
            });

            it("should call selectRandom with filtered chains", async () => {
                // Arrange
                const playerContext = createTestPlayerContext();
                const matchingChains = [createTestChain({ name: "matching1" })];
                const consumer = createConsumerWithMocks({
                    availableChains: [createTestChain(), createTestChain({ name: "chain2" })],
                    getApplicableBoardCount: 75,
                    filterChains: matchingChains,
                });
                const selectRandomSpy = jest.spyOn(consumer, "selectRandom");

                // Act
                await consumer.findSuitable(playerContext);

                // Assert
                expect(selectRandomSpy).toHaveBeenCalledWith(matchingChains, null);
            });
        });

        describe("random selection behavior", () => {
            it("should select first chain when using enhanced random selection", async () => {
                // Arrange
                const playerContext = createTestPlayerContext();
                const firstChain = createTestChain({ name: "first-chain", totalBoardCount: 75 });
                const secondChain = createTestChain({ name: "second-chain", totalBoardCount: 75 });
                const availableChains = [firstChain, secondChain];
                const consumer = createConsumerWithMocks({
                    availableChains,
                    getApplicableBoardCount: 75, // Both chains match exactly
                });

                // Mock selectRandom to return first chain (testing the interface, not the implementation)
                const selectRandomSpy = jest.spyOn(consumer, "selectRandom").mockReturnValue(firstChain);

                // Act
                const result = await consumer.findSuitable(playerContext);

                // Assert
                expect(result).toEqual(firstChain);
                expect(selectRandomSpy).toHaveBeenCalledWith([firstChain, secondChain], null);
            });

            it("should select last chain when using enhanced random selection", async () => {
                // Arrange
                const playerContext = createTestPlayerContext();
                const firstChain = createTestChain({ name: "first-chain", totalBoardCount: 75 });
                const lastChain = createTestChain({ name: "last-chain", totalBoardCount: 75 });
                const availableChains = [firstChain, lastChain];
                const consumer = createConsumerWithMocks({
                    availableChains,
                    getApplicableBoardCount: 75, // Both chains match exactly
                });

                // Mock selectRandom to return last chain (testing the interface, not the implementation)
                const selectRandomSpy = jest.spyOn(consumer, "selectRandom").mockReturnValue(lastChain);

                // Act
                const result = await consumer.findSuitable(playerContext);

                // Assert
                expect(result).toEqual(lastChain);
                expect(selectRandomSpy).toHaveBeenCalledWith([firstChain, lastChain], null);
            });

            it("should select middle chain when using enhanced random selection", async () => {
                // Arrange
                const playerContext = createTestPlayerContext();
                const firstChain = createTestChain({ name: "first-chain", totalBoardCount: 75 });
                const middleChain = createTestChain({ name: "middle-chain", totalBoardCount: 75 });
                const lastChain = createTestChain({ name: "last-chain", totalBoardCount: 75 });
                const availableChains = [firstChain, middleChain, lastChain];
                const consumer = createConsumerWithMocks({
                    availableChains,
                    getApplicableBoardCount: 75, // All chains match exactly
                });

                // Mock selectRandom to return middle chain (testing the interface, not the implementation)
                const selectRandomSpy = jest.spyOn(consumer, "selectRandom").mockReturnValue(middleChain);

                // Act
                const result = await consumer.findSuitable(playerContext);

                // Assert
                expect(result).toEqual(middleChain);
                expect(selectRandomSpy).toHaveBeenCalledWith([firstChain, middleChain, lastChain], null);
            });
        });

        describe("edge cases", () => {
            it("should handle single matching chain", async () => {
                // Arrange
                const playerContext = createTestPlayerContext();
                const singleChain = createTestChain({ name: "only-chain", totalBoardCount: 75 });
                const consumer = createConsumerWithMocks({
                    availableChains: [singleChain],
                    getApplicableBoardCount: 75, // Matches exactly
                });

                // Act
                const result = await consumer.findSuitable(playerContext);

                // Assert
                expect(result).toEqual(singleChain);
            });

            it("should handle zero balance player context", async () => {
                // Arrange
                const playerContext = createTestPlayerContext({ balance: 0 });
                const consumer = createConsumerWithMocks({
                    availableChains: [createTestChain()],
                    getApplicableBoardCount: -1,
                });

                // Act
                const result = await consumer.findSuitable(playerContext);

                // Assert
                expect(result).toBeNull();
            });

            it("should handle missing betLevel in player context", async () => {
                // Arrange
                const playerContext = createTestPlayerContext({ betLevel: undefined });
                const consumer = createConsumerWithMocks({
                    availableChains: [createTestChain()],
                    getApplicableBoardCount: 75,
                });

                // Act
                const result = await consumer.findSuitable(playerContext);

                // Assert
                expect(result).not.toBeNull();
            });

            it("should handle missing coinValue in player context", async () => {
                // Arrange
                const playerContext = createTestPlayerContext({ coinValue: undefined });
                const consumer = createConsumerWithMocks({
                    availableChains: [createTestChain()],
                    getApplicableBoardCount: 75,
                });

                // Act
                const result = await consumer.findSuitable(playerContext);

                // Assert
                expect(result).not.toBeNull();
            });
        });

        describe("with volatility filtering", () => {
            it("should pass volatility from gameConfigs to filterChains", async () => {
                // Arrange
                const playerContext = createTestPlayerContext();
                mockGameData.gameConfigs.cascadingSlotsConfig.volatility = 3;
                const filterChainsSpy = jest.spyOn(userChainConsumer, "filterChains");

                // Act
                await userChainConsumer.findSuitable(playerContext);

                // Assert
                expect(filterChainsSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), 3, null);
            });

            it("should pass null volatility when not configured", async () => {
                // Arrange
                const playerContext = createTestPlayerContext();
                delete mockGameData.gameConfigs.cascadingSlotsConfig.volatility;
                const filterChainsSpy = jest.spyOn(userChainConsumer, "filterChains");

                // Act
                await userChainConsumer.findSuitable(playerContext);

                // Assert
                expect(filterChainsSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), null, null);
            });

            it("should return chain matching configured volatility", async () => {
                // Arrange
                const playerContext = createTestPlayerContext();
                const expectedChain = createTestChain({ name: "matching-vol-chain", totalBoardCount: 75, volatility: 1 });
                mockGameData.gameConfigs.cascadingSlotsConfig.volatility = 1;
                const availableChains = [expectedChain, createTestChain({ name: "chain2", totalBoardCount: 75, volatility: 2 })];
                const consumer = createConsumerWithMocks({
                    availableChains,
                    getApplicableBoardCount: 75,
                    cryptoRandomInt: 0,
                });

                // Act
                const result = await consumer.findSuitable(playerContext);

                // Assert
                expect(result.volatility).toBe(1);
            });

            it("should return null when no chains match configured volatility", async () => {
                // Arrange
                const playerContext = createTestPlayerContext();
                mockGameData.gameConfigs.cascadingSlotsConfig.volatility = 4;
                const availableChains = [
                    createTestChain({ name: "chain1", totalBoardCount: 75, volatility: 1 }),
                    createTestChain({ name: "chain2", totalBoardCount: 75, volatility: 2 }),
                ];
                const consumer = createConsumerWithMocks({
                    availableChains,
                    getApplicableBoardCount: 75,
                });

                // Act
                const result = await consumer.findSuitable(playerContext);

                // Assert
                expect(result).toBeNull();
            });

            it("should match both board count and volatility", async () => {
                // Arrange
                const playerContext = createTestPlayerContext();
                const expectedChain = createTestChain({ name: "matching-both", totalBoardCount: 100, volatility: 3 });
                mockGameData.gameConfigs.cascadingSlotsConfig.volatility = 3;
                const availableChains = [
                    createTestChain({ name: "wrong-boards", totalBoardCount: 75, volatility: 3 }),
                    createTestChain({ name: "wrong-volatility", totalBoardCount: 100, volatility: 2 }),
                    expectedChain,
                ];
                const consumer = createConsumerWithMocks({
                    availableChains,
                    getApplicableBoardCount: 100,
                    cryptoRandomInt: 0,
                });

                // Act
                const result = await consumer.findSuitable(playerContext);

                // Assert
                expect(result.name).toBe("matching-both");
            });
        });

        describe("with RTP cooldown strategy", () => {
            it("should apply BALANCE RTP filter when last completed assignment was HIGH RTP", async () => {
                // Arrange
                const playerContext = createTestPlayerContext();
                const consumer = createConsumerWithMocks({
                    availableChains: [
                        createTestChain({ name: "wave-test", totalBoardCount: 75 }),
                        createTestChain({ name: "discovery-test", totalBoardCount: 75 }),
                    ],
                    getApplicableBoardCount: 75,
                });

                // Mock getRTPFilter to return BALANCE
                jest.spyOn(consumer, "getRTPFilter").mockResolvedValue(RTP_TYPE.BALANCE);
                const filterChainsSpy = jest.spyOn(consumer, "filterChains");

                // Act
                await consumer.findSuitable(playerContext);

                // Assert
                expect(filterChainsSpy).toHaveBeenCalledWith(expect.anything(), 75, null, RTP_TYPE.BALANCE);
            });

            it("should apply null RTP filter when last completed assignment was BALANCE RTP", async () => {
                // Arrange
                const playerContext = createTestPlayerContext();
                const consumer = createConsumerWithMocks({
                    availableChains: [
                        createTestChain({ name: "wave-test", totalBoardCount: 75 }),
                        createTestChain({ name: "discovery-test", totalBoardCount: 75 }),
                    ],
                    getApplicableBoardCount: 75,
                });

                // Mock getRTPFilter to return null
                jest.spyOn(consumer, "getRTPFilter").mockResolvedValue(null);
                const filterChainsSpy = jest.spyOn(consumer, "filterChains");

                // Act
                await consumer.findSuitable(playerContext);

                // Assert
                expect(filterChainsSpy).toHaveBeenCalledWith(expect.anything(), 75, null, null);
            });

            it("should apply null RTP filter when player has no previous completed assignments", async () => {
                // Arrange
                const playerContext = createTestPlayerContext();
                const consumer = createConsumerWithMocks({
                    availableChains: [
                        createTestChain({ name: "wave-test", totalBoardCount: 75 }),
                        createTestChain({ name: "discovery-test", totalBoardCount: 75 }),
                    ],
                    getApplicableBoardCount: 75,
                });

                // Mock getRTPFilter to return null
                jest.spyOn(consumer, "getRTPFilter").mockResolvedValue(null);
                const filterChainsSpy = jest.spyOn(consumer, "filterChains");

                // Act
                await consumer.findSuitable(playerContext);

                // Assert
                expect(filterChainsSpy).toHaveBeenCalledWith(expect.anything(), 75, null, null);
            });

            it("should return balance RTP chain when cooldown strategy filters for balance RTP", async () => {
                // Arrange
                const playerContext = createTestPlayerContext();
                const balanceChain = createTestChain({ name: "wave-test", totalBoardCount: 75 });
                const highChain = createTestChain({ name: "discovery-test", totalBoardCount: 75 });

                const consumer = createConsumerWithMocks({
                    availableChains: [balanceChain, highChain],
                    getApplicableBoardCount: 75,
                });

                // Mock getRTPFilter to return BALANCE (cooldown from high RTP)
                jest.spyOn(consumer, "getRTPFilter").mockResolvedValue(RTP_TYPE.BALANCE);

                // Act
                const result = await consumer.findSuitable(playerContext);

                // Assert
                expect(result).toBe(balanceChain);
            });

            it("should return any RTP chain when no cooldown filter is applied", async () => {
                // Arrange
                const playerContext = createTestPlayerContext();
                const balanceChain = createTestChain({ name: "wave-test", totalBoardCount: 75 });
                const highChain = createTestChain({ name: "discovery-test", totalBoardCount: 75 });

                const consumer = createConsumerWithMocks({
                    availableChains: [balanceChain, highChain],
                    getApplicableBoardCount: 75,
                });

                // Mock getRTPFilter to return null (no cooldown)
                jest.spyOn(consumer, "getRTPFilter").mockResolvedValue(null);

                // Mock selectRandom to return first chain for predictable test
                jest.spyOn(consumer, "selectRandom").mockReturnValue(balanceChain);

                // Act
                const result = await consumer.findSuitable(playerContext);

                // Assert
                expect(result).toBe(balanceChain);
            });

            it("should assign balance RTP when player completed cliffhanger chain and is now applicable for 75 boards", async () => {
                // Arrange - Player completed 50 boards with cliffhanger (HIGH RTP), now applicable for 75 boards
                const playerContext = createTestPlayerContext();
                const cliffhangerChain1 = createTestChain({ name: "cliffhanger-75boards-01", totalBoardCount: 75 });
                const cliffhangerChain2 = createTestChain({ name: "cliffhanger-75boards-02", totalBoardCount: 75 });
                const balanceRTPChain = createTestChain({ name: "wave-75boards", totalBoardCount: 75 });

                const consumer = createConsumerWithMocks({
                    availableChains: [cliffhangerChain1, cliffhangerChain2, balanceRTPChain],
                    getApplicableBoardCount: 75,
                });

                // Mock that last completed assignment was cliffhanger (HIGH RTP)
                jest.spyOn(consumer, "getRTPFilter").mockResolvedValue(RTP_TYPE.BALANCE);

                // Act
                const result = await consumer.findSuitable(playerContext);

                // Assert - Should return balance RTP chain due to cooldown strategy
                expect(result).toBe(balanceRTPChain);
                expect(result.name).toBe("wave-75boards");
            });
        });
    });

    describe("randomWithWeight", () => {
        const createChain = (overrides = {}) => ({
            name: "test-chain",
            baseBetAmount: 0.1,
            totalBoardCount: 75,
            ...overrides,
        });

        it("should return null when chains array is empty", () => {
            // Arrange
            const chains = [];

            // Act
            const result = userChainConsumer.randomWithWeight(chains, RTP_TYPE.HIGH);

            // Assert
            expect(result).toBeNull();
        });

        it("should apply weighting when rtpFilter is null (calls chance.bool with 30% likelihood)", () => {
            // Arrange
            const chains = [createChain({ name: "discovery-test", totalBoardCount: 75 }), createChain({ name: "tease-test", totalBoardCount: 75 })];

            // Mock chance methods to control randomness
            const chanceBoolSpy = jest.spyOn(require("chance").Chance.prototype, "bool").mockReturnValue(true);
            const chancePickoneSpy = jest.spyOn(require("chance").Chance.prototype, "pickone").mockReturnValue("discovery");

            // Act
            userChainConsumer.randomWithWeight(chains, null);

            // Assert - Verify that weighting logic is called with correct likelihood
            expect(chanceBoolSpy).toHaveBeenCalledWith({ likelihood: 30 });

            // Cleanup
            chanceBoolSpy.mockRestore();
            chancePickoneSpy.mockRestore();
        });

        it("should return null when rtpFilter is RTP_TYPE.BALANCE (no additional weighting needed)", () => {
            // Arrange
            const chains = [createChain({ name: "wave-test", totalBoardCount: 75 })];

            // Act & Assert
            expect(userChainConsumer.randomWithWeight(chains, RTP_TYPE.BALANCE)).toBeNull();
        });

        it("should return null when rtpFilter is RTP_TYPE.HIGH but chains array is empty", () => {
            // Arrange
            const chains = [];

            // Act
            const result = userChainConsumer.randomWithWeight(chains, RTP_TYPE.HIGH);

            // Assert
            expect(result).toBeNull();
        });

        it("should apply weighting when rtpFilter is HIGH (calls chance.bool with 30% likelihood)", () => {
            // Arrange
            const chains = [createChain({ name: "discovery-test", totalBoardCount: 75 }), createChain({ name: "tease-test", totalBoardCount: 75 })];

            // Mock chance methods to control randomness
            const chanceBoolSpy = jest.spyOn(require("chance").Chance.prototype, "bool").mockReturnValue(true);
            const chancePickoneSpy = jest.spyOn(require("chance").Chance.prototype, "pickone").mockReturnValue("discovery");

            // Act
            userChainConsumer.randomWithWeight(chains, RTP_TYPE.HIGH);

            // Assert - Verify that weighting logic is called with correct likelihood
            expect(chanceBoolSpy).toHaveBeenCalledWith({ likelihood: 30 });

            // Cleanup
            chanceBoolSpy.mockRestore();
            chancePickoneSpy.mockRestore();
        });

        it("should apply weighting when rtpFilter is HIGH and random selection chooses BALANCE (calls chance.bool with 30% likelihood)", () => {
            // Arrange
            const chains = [createChain({ name: "discovery-test", totalBoardCount: 75 }), createChain({ name: "tease-test", totalBoardCount: 75 })];

            // Mock chance.bool to return false (70% BALANCE RTP selection)
            const chanceBoolSpy = jest.spyOn(require("chance").Chance.prototype, "bool").mockReturnValue(false);
            const chancePickoneSpy = jest.spyOn(require("chance").Chance.prototype, "pickone").mockReturnValue("tease");

            // Act
            userChainConsumer.randomWithWeight(chains, RTP_TYPE.HIGH);

            // Assert - Verify that weighting logic is called with correct likelihood
            expect(chanceBoolSpy).toHaveBeenCalledWith({ likelihood: 30 });

            // Cleanup
            chanceBoolSpy.mockRestore();
            chancePickoneSpy.mockRestore();
        });
    });

    describe("filterChains", () => {
        const createChain = (overrides = {}) => ({
            name: "test-chain",
            baseBetAmount: 0.1,
            totalBoardCount: 75,
            ...overrides,
        });

        it("should return chains with exact matching totalBoardCount", () => {
            // Arrange
            const availableChains = [
                createChain({ name: "chain-50", totalBoardCount: 50 }),
                createChain({ name: "chain-75", totalBoardCount: 75 }),
                createChain({ name: "chain-100", totalBoardCount: 100 }),
                createChain({ name: "chain-125", totalBoardCount: 125 }),
            ];
            const applicableBoardCount = 100;

            // Act
            const result = userChainConsumer.filterChains(availableChains, applicableBoardCount);

            // Assert
            expect(result).toEqual([createChain({ name: "chain-100", totalBoardCount: 100 })]);
        });

        it("should return multiple chains with same totalBoardCount", () => {
            // Arrange
            const availableChains = [
                createChain({ name: "chain-100-a", totalBoardCount: 100 }),
                createChain({ name: "chain-75", totalBoardCount: 75 }),
                createChain({ name: "chain-100-b", totalBoardCount: 100 }),
                createChain({ name: "chain-125", totalBoardCount: 125 }),
            ];
            const applicableBoardCount = 100;

            // Act
            const result = userChainConsumer.filterChains(availableChains, applicableBoardCount);

            // Assert
            expect(result).toHaveLength(2);
            expect(result).toEqual([
                createChain({ name: "chain-100-a", totalBoardCount: 100 }),
                createChain({ name: "chain-100-b", totalBoardCount: 100 }),
            ]);
        });

        it("should return empty array when no chains match exactly", () => {
            // Arrange
            const availableChains = [
                createChain({ name: "chain-50", totalBoardCount: 50 }),
                createChain({ name: "chain-75", totalBoardCount: 75 }),
                createChain({ name: "chain-125", totalBoardCount: 125 }),
            ];
            const applicableBoardCount = 100; // No chain with exactly 100 boards

            // Act
            const result = userChainConsumer.filterChains(availableChains, applicableBoardCount);

            // Assert
            expect(result).toEqual([]);
        });

        it("should return empty array when availableChains is empty", () => {
            // Arrange
            const availableChains = [];
            const applicableBoardCount = 100;

            // Act
            const result = userChainConsumer.filterChains(availableChains, applicableBoardCount);

            // Assert
            expect(result).toEqual([]);
        });

        it("should handle edge case with applicableBoardCount of 0", () => {
            // Arrange
            const availableChains = [createChain({ name: "chain-0", totalBoardCount: 0 }), createChain({ name: "chain-50", totalBoardCount: 50 })];
            const applicableBoardCount = 0;

            // Act
            const result = userChainConsumer.filterChains(availableChains, applicableBoardCount);

            // Assert
            expect(result).toEqual([createChain({ name: "chain-0", totalBoardCount: 0 })]);
        });

        describe("examples from user requirements", () => {
            it("should return chain with 100 boards when applicableBoardCount is 111", () => {
                // Arrange - Based on getClosestValidBoardCount(111) = 100
                const availableChains = [
                    createChain({ name: "chain-50", totalBoardCount: 50 }),
                    createChain({ name: "chain-100", totalBoardCount: 100 }),
                    createChain({ name: "chain-125", totalBoardCount: 125 }),
                ];
                const applicableBoardCount = 100; // This would be the result of getClosestValidBoardCount(111)

                // Act
                const result = userChainConsumer.filterChains(availableChains, applicableBoardCount);

                // Assert
                expect(result).toEqual([createChain({ name: "chain-100", totalBoardCount: 100 })]);
            });

            it("should return chain with 50 boards when applicableBoardCount is 55", () => {
                // Arrange - Based on getClosestValidBoardCount(55) = 50
                const availableChains = [
                    createChain({ name: "chain-50", totalBoardCount: 50 }),
                    createChain({ name: "chain-100", totalBoardCount: 100 }),
                    createChain({ name: "chain-125", totalBoardCount: 125 }),
                ];
                const applicableBoardCount = 50; // This would be the result of getClosestValidBoardCount(55)

                // Act
                const result = userChainConsumer.filterChains(availableChains, applicableBoardCount);

                // Assert
                expect(result).toEqual([createChain({ name: "chain-50", totalBoardCount: 50 })]);
            });
        });

        describe("volatility filtering", () => {
            it("should return only chains matching the specified volatility", () => {
                // Arrange
                const availableChains = [
                    createChain({ name: "chain-v1", totalBoardCount: 100, volatility: 1 }),
                    createChain({ name: "chain-v2", totalBoardCount: 100, volatility: 2 }),
                    createChain({ name: "chain-v3", totalBoardCount: 100, volatility: 3 }),
                ];
                const applicableBoardCount = 100;
                const volatility = 2;

                // Act
                const result = userChainConsumer.filterChains(availableChains, applicableBoardCount, volatility);

                // Assert
                expect(result).toEqual([createChain({ name: "chain-v2", totalBoardCount: 100, volatility: 2 })]);
            });

            it("should return chains with both matching board count and volatility", () => {
                // Arrange
                const availableChains = [
                    createChain({ name: "chain-v1-50", totalBoardCount: 50, volatility: 1 }),
                    createChain({ name: "chain-v2-100-a", totalBoardCount: 100, volatility: 2 }),
                    createChain({ name: "chain-v2-100-b", totalBoardCount: 100, volatility: 2 }),
                    createChain({ name: "chain-v3-100", totalBoardCount: 100, volatility: 3 }),
                ];
                const applicableBoardCount = 100;
                const volatility = 2;

                // Act
                const result = userChainConsumer.filterChains(availableChains, applicableBoardCount, volatility);

                // Assert
                expect(result).toHaveLength(2);
            });

            it("should verify first chain has correct volatility", () => {
                // Arrange
                const availableChains = [
                    createChain({ name: "chain-v2-100-a", totalBoardCount: 100, volatility: 2 }),
                    createChain({ name: "chain-v2-100-b", totalBoardCount: 100, volatility: 2 }),
                ];
                const applicableBoardCount = 100;
                const volatility = 2;

                // Act
                const result = userChainConsumer.filterChains(availableChains, applicableBoardCount, volatility);

                // Assert
                expect(result[0].volatility).toBe(2);
            });

            it("should verify second chain has correct volatility", () => {
                // Arrange
                const availableChains = [
                    createChain({ name: "chain-v2-100-a", totalBoardCount: 100, volatility: 2 }),
                    createChain({ name: "chain-v2-100-b", totalBoardCount: 100, volatility: 2 }),
                ];
                const applicableBoardCount = 100;
                const volatility = 2;

                // Act
                const result = userChainConsumer.filterChains(availableChains, applicableBoardCount, volatility);

                // Assert
                expect(result[1].volatility).toBe(2);
            });

            it("should return empty array when no chains match the volatility", () => {
                // Arrange
                const availableChains = [
                    createChain({ name: "chain-v1", totalBoardCount: 100, volatility: 1 }),
                    createChain({ name: "chain-v2", totalBoardCount: 100, volatility: 2 }),
                ];
                const applicableBoardCount = 100;
                const volatility = 5;

                // Act
                const result = userChainConsumer.filterChains(availableChains, applicableBoardCount, volatility);

                // Assert
                expect(result).toEqual([]);
            });

            it("should return all matching board count chains when volatility is null", () => {
                // Arrange
                const availableChains = [
                    createChain({ name: "chain-v1", totalBoardCount: 100, volatility: 1 }),
                    createChain({ name: "chain-v2", totalBoardCount: 100, volatility: 2 }),
                    createChain({ name: "chain-v3", totalBoardCount: 100, volatility: 3 }),
                ];
                const applicableBoardCount = 100;
                const volatility = null;

                // Act
                const result = userChainConsumer.filterChains(availableChains, applicableBoardCount, volatility);

                // Assert
                expect(result).toHaveLength(3);
            });

            it("should return all matching board count chains when volatility is undefined", () => {
                // Arrange
                const availableChains = [
                    createChain({ name: "chain-v1", totalBoardCount: 100, volatility: 1 }),
                    createChain({ name: "chain-v2", totalBoardCount: 100, volatility: 2 }),
                ];
                const applicableBoardCount = 100;

                // Act
                const result = userChainConsumer.filterChains(availableChains, applicableBoardCount);

                // Assert
                expect(result).toHaveLength(2);
            });

            it("should filter by volatility 1 (lowest)", () => {
                // Arrange
                const availableChains = [
                    createChain({ name: "chain-v1", totalBoardCount: 100, volatility: 1 }),
                    createChain({ name: "chain-v5", totalBoardCount: 100, volatility: 5 }),
                ];
                const applicableBoardCount = 100;
                const volatility = 1;

                // Act
                const result = userChainConsumer.filterChains(availableChains, applicableBoardCount, volatility);

                // Assert
                expect(result[0].name).toBe("chain-v1");
            });

            it("should filter by volatility 5 (highest)", () => {
                // Arrange
                const availableChains = [
                    createChain({ name: "chain-v1", totalBoardCount: 100, volatility: 1 }),
                    createChain({ name: "chain-v5", totalBoardCount: 100, volatility: 5 }),
                ];
                const applicableBoardCount = 100;
                const volatility = 5;

                // Act
                const result = userChainConsumer.filterChains(availableChains, applicableBoardCount, volatility);

                // Assert
                expect(result[0].name).toBe("chain-v5");
            });

            it("should handle chains with default volatility value", () => {
                // Arrange
                const availableChains = [
                    createChain({ name: "chain-default", totalBoardCount: 100, volatility: 2 }),
                    createChain({ name: "chain-v3", totalBoardCount: 100, volatility: 3 }),
                ];
                const applicableBoardCount = 100;
                const volatility = 2;

                // Act
                const result = userChainConsumer.filterChains(availableChains, applicableBoardCount, volatility);

                // Assert
                expect(result).toEqual([createChain({ name: "chain-default", totalBoardCount: 100, volatility: 2 })]);
            });

            it("should exclude chains with mismatched volatility", () => {
                // Arrange
                const availableChains = [
                    createChain({ name: "chain-v2", totalBoardCount: 100, volatility: 2 }),
                    createChain({ name: "chain-v4", totalBoardCount: 100, volatility: 4 }),
                ];
                const applicableBoardCount = 100;
                const volatility = 2;

                // Act
                const result = userChainConsumer.filterChains(availableChains, applicableBoardCount, volatility);

                // Assert
                expect(result.some((chain) => chain.volatility === 4)).toBe(false);
            });

            it("should exclude chains with mismatched board count even if volatility matches", () => {
                // Arrange
                const availableChains = [
                    createChain({ name: "chain-50-v2", totalBoardCount: 50, volatility: 2 }),
                    createChain({ name: "chain-100-v2", totalBoardCount: 100, volatility: 2 }),
                ];
                const applicableBoardCount = 100;
                const volatility = 2;

                // Act
                const result = userChainConsumer.filterChains(availableChains, applicableBoardCount, volatility);

                // Assert
                expect(result.some((chain) => chain.totalBoardCount === 50)).toBe(false);
            });
        });

        describe("RTP filtering", () => {
            it("should return only HIGH RTP chains when RTP filter is HIGH", () => {
                // Arrange
                const availableChains = [
                    createChain({ name: "discovery-chain", totalBoardCount: 100 }),
                    createChain({ name: "wave-chain", totalBoardCount: 100 }),
                    createChain({ name: "cliffhanger-chain", totalBoardCount: 100 }),
                    createChain({ name: "regular-chain", totalBoardCount: 100 }),
                ];
                const applicableBoardCount = 100;
                const volatility = null;
                const rtpType = RTP_TYPE.HIGH;

                // Act
                const result = userChainConsumer.filterChains(availableChains, applicableBoardCount, volatility, rtpType);

                // Assert
                expect(result).toHaveLength(2);
                expect(result.map((chain) => chain.name)).toEqual(expect.arrayContaining(["discovery-chain", "cliffhanger-chain"]));
            });

            it("should return only BALANCE RTP chains when RTP filter is BALANCE", () => {
                // Arrange
                const availableChains = [
                    createChain({ name: "discovery-chain", totalBoardCount: 100 }),
                    createChain({ name: "wave-chain", totalBoardCount: 100 }),
                    createChain({ name: "tease-chain", totalBoardCount: 100 }),
                    createChain({ name: "comeback-chain", totalBoardCount: 100 }),
                ];
                const applicableBoardCount = 100;
                const volatility = null;
                const rtpType = RTP_TYPE.BALANCE;

                // Act
                const result = userChainConsumer.filterChains(availableChains, applicableBoardCount, volatility, rtpType);

                // Assert
                expect(result).toHaveLength(3);
                expect(result.map((chain) => chain.name)).toEqual(expect.arrayContaining(["wave-chain", "tease-chain", "comeback-chain"]));
            });

            it("should return all chains when RTP filter is null", () => {
                // Arrange
                const availableChains = [
                    createChain({ name: "discovery-chain", totalBoardCount: 100 }),
                    createChain({ name: "wave-chain", totalBoardCount: 100 }),
                    createChain({ name: "regular-chain", totalBoardCount: 100 }),
                ];
                const applicableBoardCount = 100;
                const volatility = null;
                const rtpType = null;

                // Act
                const result = userChainConsumer.filterChains(availableChains, applicableBoardCount, volatility, rtpType);

                // Assert
                expect(result).toHaveLength(3);
                expect(result.map((chain) => chain.name)).toEqual(expect.arrayContaining(["discovery-chain", "wave-chain", "regular-chain"]));
            });

            it("should combine RTP filter with board count filter", () => {
                // Arrange
                const availableChains = [
                    createChain({ name: "discovery-chain", totalBoardCount: 100 }),
                    createChain({ name: "wave-chain", totalBoardCount: 75 }),
                    createChain({ name: "tease-chain", totalBoardCount: 100 }),
                ];
                const applicableBoardCount = 100;
                const volatility = null;
                const rtpType = RTP_TYPE.BALANCE;

                // Act
                const result = userChainConsumer.filterChains(availableChains, applicableBoardCount, volatility, rtpType);

                // Assert
                expect(result).toHaveLength(1);
                expect(result[0].name).toBe("tease-chain");
            });

            it("should combine RTP filter with volatility filter", () => {
                // Arrange
                const availableChains = [
                    createChain({ name: "discovery-chain", totalBoardCount: 100, volatility: 2 }),
                    createChain({ name: "wave-chain", totalBoardCount: 100, volatility: 2 }),
                    createChain({ name: "tease-chain", totalBoardCount: 100, volatility: 3 }),
                ];
                const applicableBoardCount = 100;
                const volatility = 2;
                const rtpType = RTP_TYPE.BALANCE;

                // Act
                const result = userChainConsumer.filterChains(availableChains, applicableBoardCount, volatility, rtpType);

                // Assert
                expect(result).toHaveLength(1);
                expect(result[0].name).toBe("wave-chain");
            });

            it("should return empty array when no chains match RTP filter", () => {
                // Arrange
                const availableChains = [
                    createChain({ name: "regular-chain", totalBoardCount: 100 }),
                    createChain({ name: "unknown-chain", totalBoardCount: 100 }),
                ];
                const applicableBoardCount = 100;
                const volatility = null;
                const rtpType = RTP_TYPE.HIGH;

                // Act
                const result = userChainConsumer.filterChains(availableChains, applicableBoardCount, volatility, rtpType);

                // Assert
                expect(result).toEqual([]);
            });
        });
    });

    describe("storeAssignment", () => {
        it("should store chain in memory and database successfully", async () => {
            const chainKey = "testPlayer-0.10";
            const selectedChain = { name: "discovery-75boards-01", baseBetAmount: 0.1, totalBoardCount: 75 };
            const boards = [{ board: [1, 2, 3] }, { board: [4, 5, 6] }];
            const playerContext = {
                playerId: "player-123",
                betLevel: 1,
                coinValue: 0.1,
                operatorId: "test-operator",
                gameId: "test-game",
                currency: "USD",
            };
            const playerName = "testPlayer";

            await userChainConsumer.storeAssignment(chainKey, selectedChain, playerContext, playerName);

            // Check memory storage
            expect(mockGameData.playerChains[chainKey]).toBeDefined();
            expect(mockGameData.playerChains[chainKey].name).toBe("discovery-75boards-01");
            expect(mockGameData.playerChains[chainKey].currentIndex).toBe(0);
            expect(mockGameData.playerChains[chainKey].totalBoards).toBe(selectedChain.totalBoardCount);

            // Check database storage
            expect(mockAssignmentRepository.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    playerId: "player-123",
                    playerName: "testPlayer",
                    chainName: "discovery-75boards-01",
                    currentBoardIndex: 0,
                    totalBoards: 75,
                    betLevel: 1,
                    coinValue: 0.1,
                    status: "active",
                })
            );
        });

        it("should handle database errors gracefully", async () => {
            mockAssignmentRepository.create.mockRejectedValueOnce(new Error("Database error"));

            const chainKey = "errorPlayer-0.10";
            const selectedChain = { name: "discovery-75boards-01", baseBetAmount: 0.1, totalBoardCount: 75 };
            const boards = [{ board: [1, 2, 3] }];
            const playerContext = { playerId: "player-123", betLevel: 1, coinValue: 0.1 };
            const playerName = "errorPlayer";

            await userChainConsumer.storeAssignment(chainKey, selectedChain, playerContext, playerName);

            // Memory storage should still work
            expect(mockGameData.playerChains[chainKey]).toBeDefined();

            // Error should be logged
            expect(mockLogService.logError).toHaveBeenCalledWith(expect.stringContaining("Failed to create chain assignment for"));
        });
    });

    describe("getRTPFilter", () => {
        it("should return BALANCE when last completed assignment was HIGH RTP", async () => {
            // Arrange
            const consumer = createConsumerWithMocks();
            const playerName = "testPlayer";

            // Mock getLastCompletedAssignmentRTPType to return HIGH
            jest.spyOn(consumer, "getLastCompletedAssignmentRTPType").mockResolvedValue(RTP_TYPE.HIGH);

            // Act
            const result = await consumer.getRTPFilter(playerName);

            // Assert
            expect(result).toBe(RTP_TYPE.BALANCE);
        });

        it("should return null when last completed assignment was BALANCE RTP", async () => {
            // Arrange
            const consumer = createConsumerWithMocks();
            const playerName = "testPlayer";

            // Mock getLastCompletedAssignmentRTPType to return BALANCE
            jest.spyOn(consumer, "getLastCompletedAssignmentRTPType").mockResolvedValue(RTP_TYPE.BALANCE);

            // Act
            const result = await consumer.getRTPFilter(playerName);

            // Assert
            expect(result).toBeNull();
        });

        it("should return null when player has no previous completed assignments", async () => {
            // Arrange
            const consumer = createConsumerWithMocks();
            const playerName = "testPlayer";

            // Mock getLastCompletedAssignmentRTPType to return null
            jest.spyOn(consumer, "getLastCompletedAssignmentRTPType").mockResolvedValue(null);

            // Act
            const result = await consumer.getRTPFilter(playerName);

            // Assert
            expect(result).toBeNull();
        });
    });
});
