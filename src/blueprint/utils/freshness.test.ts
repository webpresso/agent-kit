import { describe, expect, it } from 'vitest'

import { calculateFreshness, type FreshnessScore } from './freshness.js'

// Helper to create a date N days ago
function daysAgo(days: number): Date {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date
}

// Helper to create a date N days in the future
function daysFromNow(days: number): Date {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date
}

describe('calculateFreshness', () => {
  describe('score calculation (exponential decay)', () => {
    it('should return score of 1.0 for just-updated plans', () => {
      // Arrange
      const lastUpdated = new Date()

      // Act
      const result = calculateFreshness(lastUpdated, 'in-progress')

      // Assert
      expect(result.score).toBeCloseTo(1.0, 2)
      expect(result.daysSinceUpdate).toBe(0)
    })

    it('should return score of ~0.5 at warning threshold (7 days for in-progress)', () => {
      // Arrange
      const lastUpdated = daysAgo(7)

      // Act
      const result = calculateFreshness(lastUpdated, 'in-progress')

      // Assert
      // At warning threshold, score should be 0.5 (e^(-ln(2)) = 0.5)
      expect(result.score).toBeCloseTo(0.5, 1)
    })

    it('should return score of ~0.5 at warning threshold (14 days for draft)', () => {
      // Arrange
      const lastUpdated = daysAgo(14)

      // Act
      const result = calculateFreshness(lastUpdated, 'draft')

      // Assert
      expect(result.score).toBeCloseTo(0.5, 1)
    })

    it('should return score of ~0.5 at warning threshold (180 days for completed)', () => {
      // Arrange
      const lastUpdated = daysAgo(180)

      // Act
      const result = calculateFreshness(lastUpdated, 'completed')

      // Assert
      expect(result.score).toBeCloseTo(0.5, 1)
    })

    it('should return decreasing score as time passes', () => {
      // Arrange & Act
      const score0 = calculateFreshness(daysAgo(0), 'in-progress').score
      const score3 = calculateFreshness(daysAgo(3), 'in-progress').score
      const score7 = calculateFreshness(daysAgo(7), 'in-progress').score
      const score14 = calculateFreshness(daysAgo(14), 'in-progress').score

      // Assert - scores should monotonically decrease
      expect(score0).toBeGreaterThan(score3)
      expect(score3).toBeGreaterThan(score7)
      expect(score7).toBeGreaterThan(score14)
    })

    it('should return score between 0.0 and 1.0', () => {
      // Arrange & Act
      const results: FreshnessScore[] = [
        calculateFreshness(daysAgo(0), 'in-progress'),
        calculateFreshness(daysAgo(30), 'in-progress'),
        calculateFreshness(daysAgo(100), 'in-progress'),
        calculateFreshness(daysAgo(365), 'in-progress'),
        calculateFreshness(daysAgo(1000), 'in-progress'),
      ]

      // Assert
      for (const result of results) {
        expect(result.score).toBeGreaterThanOrEqual(0.0)
        expect(result.score).toBeLessThanOrEqual(1.0)
      }
    })
  })

  describe('status-specific thresholds (in-progress: 7/14/30)', () => {
    it('should return fresh status when under warning threshold', () => {
      // Arrange
      const lastUpdated = daysAgo(6)

      // Act
      const result = calculateFreshness(lastUpdated, 'in-progress')

      // Assert
      expect(result.status).toBe('fresh')
    })

    it('should return aging status at 7 days', () => {
      // Arrange
      const lastUpdated = daysAgo(7)

      // Act
      const result = calculateFreshness(lastUpdated, 'in-progress')

      // Assert
      expect(result.status).toBe('aging')
    })

    it('should return stale status at 14 days', () => {
      // Arrange
      const lastUpdated = daysAgo(14)

      // Act
      const result = calculateFreshness(lastUpdated, 'in-progress')

      // Assert
      expect(result.status).toBe('stale')
    })

    it('should return critical status at 30 days', () => {
      // Arrange
      const lastUpdated = daysAgo(30)

      // Act
      const result = calculateFreshness(lastUpdated, 'in-progress')

      // Assert
      expect(result.status).toBe('critical')
    })
  })

  describe('status-specific thresholds (draft: 14/30/60)', () => {
    it('should return fresh status when under 14 days', () => {
      // Arrange
      const lastUpdated = daysAgo(13)

      // Act
      const result = calculateFreshness(lastUpdated, 'draft')

      // Assert
      expect(result.status).toBe('fresh')
    })

    it('should return aging status at 14 days', () => {
      // Arrange
      const lastUpdated = daysAgo(14)

      // Act
      const result = calculateFreshness(lastUpdated, 'draft')

      // Assert
      expect(result.status).toBe('aging')
    })

    it('should return stale status at 30 days', () => {
      // Arrange
      const lastUpdated = daysAgo(30)

      // Act
      const result = calculateFreshness(lastUpdated, 'draft')

      // Assert
      expect(result.status).toBe('stale')
    })

    it('should return critical status at 60 days', () => {
      // Arrange
      const lastUpdated = daysAgo(60)

      // Act
      const result = calculateFreshness(lastUpdated, 'draft')

      // Assert
      expect(result.status).toBe('critical')
    })
  })

  describe('status-specific thresholds (completed: 180/365/730)', () => {
    it('should return fresh status when under 180 days', () => {
      // Arrange
      const lastUpdated = daysAgo(179)

      // Act
      const result = calculateFreshness(lastUpdated, 'completed')

      // Assert
      expect(result.status).toBe('fresh')
    })

    it('should return aging status at 180 days', () => {
      // Arrange
      const lastUpdated = daysAgo(180)

      // Act
      const result = calculateFreshness(lastUpdated, 'completed')

      // Assert
      expect(result.status).toBe('aging')
    })

    it('should return stale status at 365 days', () => {
      // Arrange
      const lastUpdated = daysAgo(365)

      // Act
      const result = calculateFreshness(lastUpdated, 'completed')

      // Assert
      expect(result.status).toBe('stale')
    })

    it('should return critical status at 730 days (2 years)', () => {
      // Arrange
      const lastUpdated = daysAgo(730)

      // Act
      const result = calculateFreshness(lastUpdated, 'completed')

      // Assert
      expect(result.status).toBe('critical')
    })
  })

  describe('status-specific thresholds (planned: 14/30/60)', () => {
    it('should return fresh status when under 14 days', () => {
      // Arrange
      const lastUpdated = daysAgo(13)

      // Act
      const result = calculateFreshness(lastUpdated, 'planned')

      // Assert
      expect(result.status).toBe('fresh')
    })

    it('should return warning status at exactly 14 days', () => {
      // Arrange
      const lastUpdated = daysAgo(14)

      // Act
      const result = calculateFreshness(lastUpdated, 'planned')

      // Assert
      expect(result.status).toBe('aging')
    })

    it('should return stale status at exactly 30 days', () => {
      // Arrange
      const lastUpdated = daysAgo(30)

      // Act
      const result = calculateFreshness(lastUpdated, 'planned')

      // Assert
      expect(result.status).toBe('stale')
    })

    it('should return critical status at exactly 60 days', () => {
      // Arrange
      const lastUpdated = daysAgo(60)

      // Act
      const result = calculateFreshness(lastUpdated, 'planned')

      // Assert
      expect(result.status).toBe('critical')
    })

    it('should return score of ~0.5 at 14-day warning threshold', () => {
      // Arrange
      const lastUpdated = daysAgo(14)

      // Act
      const result = calculateFreshness(lastUpdated, 'planned')

      // Assert
      expect(result.score).toBeCloseTo(0.5, 1)
    })

    it('should return decreasing score over time', () => {
      // Arrange & Act
      const score0 = calculateFreshness(daysAgo(0), 'planned').score
      const score14 = calculateFreshness(daysAgo(14), 'planned').score
      const score30 = calculateFreshness(daysAgo(30), 'planned').score
      const score60 = calculateFreshness(daysAgo(60), 'planned').score

      // Assert - scores should monotonically decrease
      expect(score0).toBeGreaterThan(score14)
      expect(score14).toBeGreaterThan(score30)
      expect(score30).toBeGreaterThan(score60)
    })
  })

  describe('status-specific thresholds (archived: 365/730/1460)', () => {
    it('should return fresh status when under 365 days', () => {
      // Arrange
      const lastUpdated = daysAgo(364)

      // Act
      const result = calculateFreshness(lastUpdated, 'archived')

      // Assert
      expect(result.status).toBe('fresh')
    })

    it('should return aging status at exactly 365 days', () => {
      // Arrange
      const lastUpdated = daysAgo(365)

      // Act
      const result = calculateFreshness(lastUpdated, 'archived')

      // Assert
      expect(result.status).toBe('aging')
    })

    it('should return stale status at exactly 730 days (2 years)', () => {
      // Arrange
      const lastUpdated = daysAgo(730)

      // Act
      const result = calculateFreshness(lastUpdated, 'archived')

      // Assert
      expect(result.status).toBe('stale')
    })

    it('should return critical status at exactly 1460 days (4 years)', () => {
      // Arrange
      const lastUpdated = daysAgo(1460)

      // Act
      const result = calculateFreshness(lastUpdated, 'archived')

      // Assert
      expect(result.status).toBe('critical')
    })

    it('should return score of ~0.5 at 365-day warning threshold', () => {
      // Arrange
      const lastUpdated = daysAgo(365)

      // Act
      const result = calculateFreshness(lastUpdated, 'archived')

      // Assert
      expect(result.score).toBeCloseTo(0.5, 1)
    })

    it('should return decreasing score over time', () => {
      // Arrange & Act
      const score0 = calculateFreshness(daysAgo(0), 'archived').score
      const score365 = calculateFreshness(daysAgo(365), 'archived').score
      const score730 = calculateFreshness(daysAgo(730), 'archived').score
      const score1460 = calculateFreshness(daysAgo(1460), 'archived').score

      // Assert - scores should monotonically decrease
      expect(score0).toBeGreaterThan(score365)
      expect(score365).toBeGreaterThan(score730)
      expect(score730).toBeGreaterThan(score1460)
    })
  })

  describe('daysSinceUpdate calculation', () => {
    it('should return 0 for today', () => {
      // Arrange
      const lastUpdated = new Date()

      // Act
      const result = calculateFreshness(lastUpdated, 'in-progress')

      // Assert
      expect(result.daysSinceUpdate).toBe(0)
    })

    it('should return correct number of days', () => {
      // Arrange
      const lastUpdated = daysAgo(10)

      // Act
      const result = calculateFreshness(lastUpdated, 'in-progress')

      // Assert
      expect(result.daysSinceUpdate).toBe(10)
    })

    it('should floor partial days within a calendar day', () => {
      // Arrange - noon of 2 calendar days ago (unambiguously 2 days regardless of time of day)
      const lastUpdated = new Date()
      lastUpdated.setDate(lastUpdated.getDate() - 2)
      lastUpdated.setHours(12, 0, 0, 0)

      // Act
      const result = calculateFreshness(lastUpdated, 'in-progress')

      // Assert - noon of 2 days ago is 2 calendar days
      expect(result.daysSinceUpdate).toBe(2)
    })
  })

  describe('edge cases', () => {
    it('should handle future dates (return score 1.0 and 0 days)', () => {
      // Arrange
      const lastUpdated = daysFromNow(5)

      // Act
      const result = calculateFreshness(lastUpdated, 'in-progress')

      // Assert
      expect(result.score).toBeCloseTo(1.0, 2)
      expect(result.daysSinceUpdate).toBeLessThanOrEqual(0)
      expect(result.status).toBe('fresh')
    })

    it('should handle very old dates without underflow', () => {
      // Arrange - 10 years ago
      const lastUpdated = daysAgo(3650)

      // Act
      const result = calculateFreshness(lastUpdated, 'in-progress')

      // Assert - score should be very close to 0 but not negative
      expect(result.score).toBeGreaterThanOrEqual(0)
      expect(result.score).toBeLessThan(0.001)
      expect(result.status).toBe('critical')
    })

    it('should handle exactly at threshold boundaries', () => {
      // Arrange & Act - exactly at warning threshold
      const atWarning = calculateFreshness(daysAgo(7), 'in-progress')
      const beforeWarning = calculateFreshness(daysAgo(6), 'in-progress')

      // Assert
      expect(atWarning.status).toBe('aging')
      expect(beforeWarning.status).toBe('fresh')
    })

    it('should handle midnight boundary correctly', () => {
      // Arrange - exactly 1 day ago at midnight
      const lastUpdated = new Date()
      lastUpdated.setHours(0, 0, 0, 0)
      lastUpdated.setDate(lastUpdated.getDate() - 1)

      // Act
      const result = calculateFreshness(lastUpdated, 'in-progress')

      // Assert - should be at least 1 day
      expect(result.daysSinceUpdate).toBeGreaterThanOrEqual(1)
    })
  })
})
