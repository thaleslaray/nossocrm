import type { Activity } from '@/types';

/**
 * Ordenação inteligente de atividades seguindo padrão de mercado para CRMs:
 * 1. Atrasadas (data < hoje) - mais antigas primeiro (mais urgente)
 * 2. Hoje (data === hoje) - mais próximas primeiro
 * 3. Futuras (data > hoje) - mais próximas primeiro
 * 
 * @param activities - Array de atividades para ordenar
 * @returns Array ordenado
 */
export function sortActivitiesSmart(activities: Activity[]): Activity[] {
  const now = new Date();
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // Separa em grupos
  const overdue: Activity[] = [];
  const todayActivities: Activity[] = [];
  const future: Activity[] = [];
  
  activities.forEach(activity => {
    const activityDate = new Date(activity.date);
    const activityDateOnly = new Date(activityDate.getFullYear(), activityDate.getMonth(), activityDate.getDate());
    
    if (activityDateOnly < todayDate) {
      overdue.push(activity);
    } else if (activityDateOnly.getTime() === todayDate.getTime()) {
      todayActivities.push(activity);
    } else {
      future.push(activity);
    }
  });
  
  // Ordena cada grupo
  // Atrasadas: mais antigas primeiro (crescente) = mais urgente
  overdue.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  // Hoje: ordena por hora (mais próximas primeiro)
  todayActivities.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  // Futuras: mais próximas primeiro (crescente)
  future.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  // Retorna: atrasadas + hoje + futuras
  return [...overdue, ...todayActivities, ...future];
}

