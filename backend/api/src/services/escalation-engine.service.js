const generateEscalationDecision = async ({
  overdueDays,
  outstanding,
  recoveryProbability
}) => {
  let escalationLevel = 'NONE';
  let action = 'Continue standard reminders';

  if (overdueDays > 30 || outstanding > 25000) {
    escalationLevel = 'LEVEL_1';
    action = 'Assign dedicated collection follow-up';
  }

  if (overdueDays > 60 || recoveryProbability < 50) {
    escalationLevel = 'LEVEL_2';
    action = 'Escalate to recovery manager';
  }

  if (overdueDays > 90 || recoveryProbability < 20) {
    escalationLevel = 'LEVEL_3';
    action = 'Initiate legal/recovery escalation workflow';
  }

  return {
    escalationLevel,
    action,
    generatedAt: new Date()
  };
};

module.exports = {
  generateEscalationDecision
};
