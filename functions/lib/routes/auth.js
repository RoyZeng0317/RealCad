import { Router } from 'express';
import passport from 'passport';
const router = Router();
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), (_req, res) => {
    res.redirect(process.env.CLIENT_URL ?? 'http://localhost:5173');
});
router.get('/me', (req, res) => {
    if (req.isAuthenticated()) {
        res.json(req.user);
    }
    else {
        res.status(401).json({ error: 'Not authenticated' });
    }
});
router.post('/logout', (req, res) => {
    req.logout(() => {
        res.json({ success: true });
    });
});
export default router;
//# sourceMappingURL=auth.js.map