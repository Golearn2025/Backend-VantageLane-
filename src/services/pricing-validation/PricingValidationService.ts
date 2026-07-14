import { QuoteEconomicsSnapshot } from './QuoteEconomicsSnapshot';
import {
  PricingValidationRuleRow,
  PricingValidationResult,
  PricingValidationViolation,
  QuoteEconomicsLegInput,
  QuoteEconomicsSnapshotInput,
  ValidateOptions,
  ValidationRuleCode,
  ValidationThresholdMode,
} from './pricingValidation.types';

type EvalContext = QuoteEconomicsSnapshotInput | QuoteEconomicsLegInput;

/**
 * Phase 0: economics validation scaffold — no PricingEngine / persistence hooks.
 */
export class PricingValidationService {
  /**
   * Future: load active rules for organizationId from `pricing_validation_rules`.
   * Phase 0 returns [] unless rules are injected via options.
   */
  async loadRulesForOrganization(
    _organizationId: string
  ): Promise<PricingValidationRuleRow[]> {
    return [];
  }

  async validate(
    snapshot: QuoteEconomicsSnapshotInput,
    options: ValidateOptions = {}
  ): Promise<PricingValidationResult> {
    const normalized = QuoteEconomicsSnapshot.fromInput(snapshot);
    return this.validateSnapshot(normalized, options);
  }

  validateSnapshot(
    snapshot: QuoteEconomicsSnapshot,
    options: ValidateOptions = {}
  ): PricingValidationResult {
    if (snapshot.isBespoke()) {
      return { ok: true, violations: [], skipped: true, skipReason: 'bespoke' };
    }

    const rules =
      options.rules ??
      ([] as PricingValidationRuleRow[]);

    if (rules.length === 0) {
      return {
        ok: true,
        violations: [],
        skipped: true,
        skipReason: 'no_active_rules',
      };
    }

    const violations: PricingValidationViolation[] = [];

    if (snapshot.isFleet && snapshot.legs?.length) {
      for (const leg of snapshot.legs) {
        const legRules = this.filterRules(rules, snapshot, leg.bookingType);
        violations.push(
          ...this.evaluateRules(legRules, leg, snapshot.organizationId, {
            scope: 'leg',
            legIndex: leg.legIndex,
          })
        );
      }
      const aggRules = this.filterRules(rules, snapshot, null);
      violations.push(
        ...this.evaluateRules(aggRules, snapshot, snapshot.organizationId, {
          scope: 'aggregated',
        })
      );
    } else {
      const bookingRules = this.filterRules(
        rules,
        snapshot,
        snapshot.bookingType === 'bespoke' ? null : snapshot.bookingType
      );
      violations.push(
        ...this.evaluateRules(bookingRules, snapshot, snapshot.organizationId, {
          scope: 'booking',
        })
      );
    }

    const blocking = violations.filter((v) => v.onFail === 'block');
    return {
      ok: blocking.length === 0,
      violations,
    };
  }

  private filterRules(
    rules: PricingValidationRuleRow[],
    snapshot: QuoteEconomicsSnapshot,
    legBookingType: string | null
  ): PricingValidationRuleRow[] {
    return rules
      .filter((r) => r.is_active && r.organization_id === snapshot.organizationId)
      .filter((r) => {
        if (r.booking_type == null) return true;
        if (legBookingType == null) return r.booking_type == null;
        return r.booking_type === legBookingType;
      })
      .filter((r) => {
        if (!r.vehicle_category_id) return true;
        return r.vehicle_category_id === snapshot.vehicleCategoryId;
      })
      .sort((a, b) => b.priority - a.priority);
  }

  private evaluateRules(
    rules: PricingValidationRuleRow[],
    ctx: EvalContext,
    organizationId: string,
    meta: { scope: 'leg' | 'aggregated' | 'booking'; legIndex?: number }
  ): PricingValidationViolation[] {
    const violations: PricingValidationViolation[] = [];

    for (const rule of rules) {
      if (rule.organization_id !== organizationId) continue;

      const measured = this.measureForRule(rule.rule_code as ValidationRuleCode, ctx);
      if (measured == null) continue;

      const failed = !this.passesThreshold(
        measured,
        rule.threshold_value,
        rule.threshold_mode
      );

      if (failed) {
        violations.push({
          ruleId: rule.id,
          ruleCode: rule.rule_code,
          onFail: rule.on_fail,
          message: this.buildMessage(rule, measured, meta),
          legIndex: meta.legIndex,
          scope: meta.scope,
          measuredValue: measured,
          thresholdValue: rule.threshold_value,
        });
      }
    }

    return violations;
  }

  private measureForRule(
    ruleCode: ValidationRuleCode | string,
    ctx: EvalContext
  ): number | null {
    switch (ruleCode) {
      case 'client_total_min':
        return ctx.clientTotalPence;
      case 'client_net_min':
        return ctx.clientNetPence;
      case 'operator_commission_min':
        return ctx.operatorCommissionPence;
      case 'platform_fee_min':
        return ctx.platformFeePence;
      case 'estimated_driver_max':
        return ctx.estimatedDriverPence;
      case 'operator_margin_pct_min': {
        if (ctx.clientTotalPence <= 0) return null;
        const margin = ctx.clientTotalPence - ctx.estimatedDriverPence - ctx.platformFeePence;
        return Math.round((margin / ctx.clientTotalPence) * 10000);
      }
      default:
        return null;
    }
  }

  private passesThreshold(
    measured: number,
    threshold: number,
    mode: ValidationThresholdMode
  ): boolean {
    switch (mode) {
      case 'gte':
        return measured >= threshold;
      case 'lte':
        return measured <= threshold;
      case 'pct_gte':
        return measured >= threshold;
      case 'pct_lte':
        return measured <= threshold;
      default:
        return true;
    }
  }

  private buildMessage(
    rule: PricingValidationRuleRow,
    measured: number,
    meta: { scope: string; legIndex?: number }
  ): string {
    const leg =
      meta.legIndex != null ? ` leg ${meta.legIndex}` : '';
    return `[${meta.scope}${leg}] ${rule.rule_code}: measured ${measured}, threshold ${rule.threshold_mode} ${rule.threshold_value}`;
  }
}

export const pricingValidationService = new PricingValidationService();
