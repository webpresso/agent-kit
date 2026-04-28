import { getFilePath } from '#hooks/shared/types';
import { validateBlueprint as validateBlueprintShared } from '#hooks/shared/validators/blueprint';
export function validateBlueprint(input) {
    const filePath = getFilePath(input);
    const result = validateBlueprintShared(filePath);
    if (result.details?.skipReason) {
        return { validator: 'blueprint', passed: true, skipped: true, skipReason: result.details.skipReason };
    }
    return { validator: 'blueprint', passed: result.valid };
}
//# sourceMappingURL=blueprint.js.map