# Reference inspection notes

The supplied Lovable preview URL resolves in the sandbox browser to a Lovable auth-bridge loading page rather than the application itself. No reference DOM, canvas, or interactive scene was available to inspect directly. The implementation direction therefore follows the user-provided reference brief: preserve SAMVID’s existing application structure and add a non-invasive living 3D layer with restrained particle/node motion, subtle connections, depth, cursor response, smooth camera/section transitions, cinematic entrance, hover states, lighter mobile rendering, and no readability-blocking animation.

The existing SAMVID app already has the central WebGL identity scene, protected routes, record/permission/security/gateway views, and owner HOME hub. The enhancement should be additive to those existing components rather than a new page or architecture replacement.
