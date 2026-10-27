export { renderContract, type ContractValues } from './domain/render';
export { TEMPLATE_FIELDS, validateTemplate, type TemplateField } from './domain/template';
export {
  MAX_PAYMENT_STEPS,
  splitAmount,
  toMinorUnits,
  validatePaymentPlan,
} from './domain/payments';
export { SAMPLE_CONTRACT_VALUES } from './domain/sample';
export {
  AD_PLATFORMS,
  AUTOMATION_TOOLS,
  MODULE_CODES,
  moduleClauses,
  parseModules,
  PAYMENT_PRESETS,
  SOCIAL_PLATFORMS,
  SOLUTIONS,
  type ContractModule,
  type ModuleCode,
} from './domain/modules';
