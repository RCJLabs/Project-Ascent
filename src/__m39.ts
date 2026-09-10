import { DRILLS } from '@/content/drills';
console.log('category of drills that legitimately need a hangboard:');
for (const d of DRILLS.filter((x) => x.equipment.includes('hangboard'))) console.log(`  ${d.category.padEnd(18)} ${d.id}`);
console.log('\ncategory of the nine that wrongly claimed one:');
for (const id of ['limit_boulders_on_the_crimps','volume_on_moderate_crimps','power_endurance_circuit','limit_bouldering_sessions','pp_graduation_assessment','pp_final_attempts','projecting_with_crimp_focus','deload_max_hang_day_off_flow'])
  { const d = DRILLS.find((x) => x.id === id)!; console.log(`  ${d.category.padEnd(18)} ${d.id}`); }
