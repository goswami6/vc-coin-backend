const { createPlan, getAllPlans, getActivePlans, getPlanById, updatePlan, deletePlan } = require('../models/planModel');

const create = async (req, res) => {
  try {
    const { name, investment_amount, daily_roi, tenure_days, total_return } = req.body;

    if (!name || !investment_amount || !daily_roi || !tenure_days) {
      return res.status(400).json({ message: 'Plan name, investment amount, daily ROI, and tenure days are required.' });
    }

    const image = req.file ? `/uploads/${req.file.filename}` : null;
    const computedReturn = total_return || (investment_amount * daily_roi / 100 * tenure_days + Number(investment_amount));

    const plan = await createPlan({
      name,
      image,
      investment_amount: Number(investment_amount),
      daily_roi: Number(daily_roi),
      tenure_days: Number(tenure_days),
      total_return: Number(computedReturn),
    });

    res.status(201).json({ plan, message: 'Plan created successfully.' });
  } catch (error) {
    console.error('Create plan error:', error);
    res.status(500).json({ message: 'Failed to create plan.' });
  }
};

const list = async (req, res) => {
  try {
    const plans = await getAllPlans();
    res.json({ plans });
  } catch (error) {
    console.error('List plans error:', error);
    res.status(500).json({ message: 'Failed to fetch plans.' });
  }
};

const listActive = async (req, res) => {
  try {
    const plans = await getActivePlans();
    res.json({ plans });
  } catch (error) {
    console.error('List active plans error:', error);
    res.status(500).json({ message: 'Failed to fetch plans.' });
  }
};

const getOne = async (req, res) => {
  try {
    const plan = await getPlanById(req.params.id);
    if (!plan) return res.status(404).json({ message: 'Plan not found.' });
    res.json({ plan });
  } catch (error) {
    console.error('Get plan error:', error);
    res.status(500).json({ message: 'Failed to fetch plan.' });
  }
};

const update = async (req, res) => {
  try {
    const { name, investment_amount, daily_roi, tenure_days, total_return, status } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : null;

    const computedReturn = total_return || (investment_amount * daily_roi / 100 * tenure_days + Number(investment_amount));

    const plan = await updatePlan(req.params.id, {
      name,
      image,
      investment_amount: Number(investment_amount),
      daily_roi: Number(daily_roi),
      tenure_days: Number(tenure_days),
      total_return: Number(computedReturn),
      status,
    });

    res.json({ plan, message: 'Plan updated successfully.' });
  } catch (error) {
    console.error('Update plan error:', error);
    res.status(500).json({ message: 'Failed to update plan.' });
  }
};

const remove = async (req, res) => {
  try {
    await deletePlan(req.params.id);
    res.json({ message: 'Plan deleted successfully.' });
  } catch (error) {
    console.error('Delete plan error:', error);
    res.status(500).json({ message: 'Failed to delete plan.' });
  }
};

module.exports = { create, list, listActive, getOne, update, remove };
