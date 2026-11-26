import { BaseTrack } from './BaseTrack';
import { LinearStrategy } from '../strategies/LinearStrategy';
import { HifzAmountUnit } from '../builders/PlanTypes';

/**
 * LinearTrack
 * Represents a standard memorization path (Point A to Point B).
 * 🚀 UPDATE: Now accepts an optional 'endIdx' and 'unit' ('LINES' | 'AYAHS').
 */
export class LinearTrack extends BaseTrack {
    constructor(
        id: number, 
        name: string, 
        startIdx: number, 
        amount: number,
        endIdx?: number, // 🚀 Optional End Boundary
        unit: HifzAmountUnit = 'LINES'
    ) {
        super(
            id, 
            name, 
            'linear', 
            new LinearStrategy(), 
            { amount, endIdx, unit }, // Pass to Strategy Config
            startIdx
        );
    }
}
