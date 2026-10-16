import { useState } from 'react';
import { View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Car, Truck, Bike, CarTaxiFront, ChevronDown, ChevronUp } from 'lucide-react-native';

import { AppButton, AppText, PressableScale, TextField } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { useLocale } from '@/hooks/useLocale';
import type { VehicleType } from '@/types';
import type { CreateVehicleInput } from '@/services';
import { formatPlate, isValidPlate, normalizePlate } from '@/utils/plate';
import { haptics } from '@/utils/haptics';

const schema = z.object({
  plateNumber: z.string().refine((value) => isValidPlate(value)),
  type: z.enum(['private', 'commercial', 'taxi', 'motorcycle']),
  make: z.string().trim().max(30).optional(),
  model: z.string().trim().max(30).optional(),
  color: z.string().trim().max(24).optional(),
});

type FormValues = z.infer<typeof schema>;

const VEHICLE_TYPES: { value: VehicleType; Icon: typeof Car }[] = [
  { value: 'private', Icon: Car },
  { value: 'commercial', Icon: Truck },
  { value: 'taxi', Icon: CarTaxiFront },
  { value: 'motorcycle', Icon: Bike },
];

export interface VehicleFormProps {
  defaultValues?: Partial<CreateVehicleInput>;
  submitLabel: string;
  onSubmit: (input: CreateVehicleInput) => void;
  isSubmitting?: boolean;
  /** Optional details start collapsed so the required path stays short. */
  startExpanded?: boolean;
}

/** Shared by onboarding and "add vehicle" so both stay in sync. */
export function VehicleForm({
  defaultValues,
  submitLabel,
  onSubmit,
  isSubmitting = false,
  startExpanded = false,
}: VehicleFormProps) {
  const { colors } = useTheme();
  const { t, row } = useLocale();
  const [expanded, setExpanded] = useState(startExpanded);

  const { control, handleSubmit, formState, watch, setValue } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      plateNumber: defaultValues?.plateNumber ?? '',
      type: defaultValues?.type ?? 'private',
      make: defaultValues?.make ?? '',
      model: defaultValues?.model ?? '',
      color: defaultValues?.color ?? '',
    },
  });

  const selectedType = watch('type');

  const submit = handleSubmit((values) =>
    onSubmit({
      plateNumber: values.plateNumber,
      type: values.type,
      make: values.make || undefined,
      model: values.model || undefined,
      color: values.color || undefined,
    }),
  );

  return (
    <View style={{ gap: spacing.xl }}>
      <Controller
        control={control}
        name="plateNumber"
        render={({ field, fieldState }) => (
          <TextField
            label={t('vehicle.plate')}
            hint={t('vehicle.plateHint')}
            emphasis="strong"
            value={formatPlate(field.value)}
            onChangeText={(value) => field.onChange(normalizePlate(value))}
            onBlur={field.onBlur}
            placeholder="6-1234-56"
            keyboardType="number-pad"
            maxLength={10}
            error={
              fieldState.isTouched && fieldState.error ? t('vehicle.plateInvalid') : undefined
            }
            testID="vehicle-plate"
          />
        )}
      />

      <View style={{ gap: spacing.sm }}>
        <AppText variant="label" color="textSecondary">
          {t('vehicle.type')}
        </AppText>
        <View style={{ flexDirection: row, gap: spacing.sm }}>
          {VEHICLE_TYPES.map(({ value, Icon }) => {
            const active = value === selectedType;
            return (
              <PressableScale
                key={value}
                onPress={() => {
                  haptics.select();
                  setValue('type', value, { shouldValidate: true });
                }}
                scaleTo={0.95}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t(`vehicle.type.${value}` as const)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: spacing.xs,
                  paddingVertical: spacing.md,
                  borderRadius: radius.lg,
                  backgroundColor: active ? colors.brandSoft : colors.surface,
                  borderWidth: active ? 2 : 1,
                  borderColor: active ? colors.brand : colors.border,
                }}
              >
                <Icon
                  size={22}
                  color={active ? colors.brand : colors.textSecondary}
                  strokeWidth={2.1}
                />
                <AppText
                  variant="caption"
                  align="center"
                  numberOfLines={1}
                  style={{ color: active ? colors.successText : colors.textSecondary }}
                >
                  {t(`vehicle.type.${value}` as const)}
                </AppText>
              </PressableScale>
            );
          })}
        </View>
      </View>

      <PressableScale
        onPress={() => {
          haptics.select();
          setExpanded((value) => !value);
        }}
        hitSlop={8}
        style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}
      >
        <AppText variant="label" color="brand">
          {t('vehicle.optionalDetails')}
        </AppText>
        {expanded ? (
          <ChevronUp size={16} color={colors.brand} strokeWidth={2.4} />
        ) : (
          <ChevronDown size={16} color={colors.brand} strokeWidth={2.4} />
        )}
      </PressableScale>

      {expanded ? (
        <View style={{ gap: spacing.lg }}>
          <View style={{ flexDirection: row, gap: spacing.md }}>
            <Controller
              control={control}
              name="make"
              render={({ field }) => (
                <TextField
                  label={t('vehicle.make')}
                  containerStyle={{ flex: 1 }}
                  value={field.value ?? ''}
                  onChangeText={field.onChange}
                  placeholder="Toyota"
                  autoCapitalize="words"
                />
              )}
            />
            <Controller
              control={control}
              name="model"
              render={({ field }) => (
                <TextField
                  label={t('vehicle.model')}
                  containerStyle={{ flex: 1 }}
                  value={field.value ?? ''}
                  onChangeText={field.onChange}
                  placeholder="Corolla"
                  autoCapitalize="words"
                />
              )}
            />
          </View>

          <Controller
            control={control}
            name="color"
            render={({ field }) => (
              <TextField
                label={t('vehicle.color')}
                value={field.value ?? ''}
                onChangeText={field.onChange}
                placeholder="White"
                autoCapitalize="words"
              />
            )}
          />
        </View>
      ) : null}

      <AppButton
        label={submitLabel}
        disabled={!formState.isValid}
        loading={isSubmitting}
        onPress={submit}
        testID="vehicle-submit"
      />
    </View>
  );
}
