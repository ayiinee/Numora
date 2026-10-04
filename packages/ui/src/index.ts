/**
 * NUMORA UI Component Library
 *
 * A comprehensive, accessible component library for NUMORA
 * Built on NUMORA Design System tokens
 */

// ============================================
// BUTTON COMPONENTS
// ============================================

export { Button, IconButton, buttonStyles } from './button';
export { Dialog } from './dialog';
export type { DialogProps } from './dialog';
export { Tabs } from './tabs';
export type { TabsProps, TabItem } from './tabs';
export type { ButtonProps, ButtonVariant, ButtonSize } from './button';
export type { IconButtonProps, IconButtonVariant, IconButtonSize } from './button';

// ============================================
// CARD COMPONENTS
// ============================================

export { Card, CardHeader, CardContent, CardFooter, getCardStyles } from './card';
export type { CardProps, CardVariant, CardPadding } from './card';

// ============================================
// BADGE COMPONENTS
// ============================================

export { Badge, StatusBadge, LevelBadge, XPBadge, StarBadge } from './badge';
export type { BadgeProps, BadgeVariant, BadgeSize } from './badge';
export type { StatusBadgeProps } from './badge';
export type { LevelBadgeProps } from './badge';
export type { XPBadgeProps } from './badge';
export type { StarBadgeProps } from './badge';

// ============================================
// INPUT COMPONENTS
// ============================================

export { Input, Textarea, Select, Checkbox } from './input';
export type { InputProps, InputSize } from './input';
export type { TextareaProps } from './input';
export type { SelectProps } from './input';
export type { CheckboxProps } from './input';

// ============================================
// SKELETON COMPONENTS
// ============================================

export { Skeleton, SkeletonGroup, CardSkeleton, ListRowSkeleton } from './skeleton';
export type { SkeletonProps, SkeletonVariant, SkeletonSize } from './skeleton';
export type { SkeletonGroupProps } from './skeleton';
export type { CardSkeletonProps } from './skeleton';
export type { ListRowSkeletonProps } from './skeleton';

// ============================================
// PROGRESS COMPONENTS
// ============================================

export { ProgressBar, ProgressRing, StatCard, StarsDisplay } from './progress';
export type { ProgressBarProps, ProgressSize, ProgressVariant } from './progress';
export type { ProgressRingProps } from './progress';
export type { StatCardProps } from './progress';
export type { StarsDisplayProps } from './progress';

// ============================================
// LIST & ROW COMPONENTS
// ============================================

export { ListRow, SectionHeader, PageHeader, EmptyState, Divider } from './list-row';
export type { ListRowProps } from './list-row';
export type { SectionHeaderProps } from './list-row';
export type { PageHeaderProps } from './list-row';
export type { EmptyStateProps } from './list-row';
export type { DividerProps } from './list-row';

// ============================================
// NAVIGATION COMPONENTS
// ============================================

export { BottomNav, TopBar, Avatar, GreetingHeader, FeatureGrid } from './navigation';
export type { NavItem, BottomNavProps } from './navigation';
export type { TopBarProps } from './navigation';
export type { AvatarProps } from './navigation';
export type { GreetingHeaderProps } from './navigation';
export type { FeatureItem, FeatureGridProps } from './navigation';

// ============================================
// LEGACY COMPONENTS (to be migrated)
// ============================================

export { Brand } from './brand';
export { Icon } from './icon';
export type { IconName } from './icon';
