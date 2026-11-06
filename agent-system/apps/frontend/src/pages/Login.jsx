import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '@/stores/useAuthStore';

import { Button } from '@/components/ui/button';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, MessageSquare, Lock, Mail } from 'lucide-react';

const formSchema = z.object({
    email: z.string().email({
        message: "Please enter a valid email address.",
    }),
    password: z.string().min(6, {
        message: "Password must be at least 6 characters.",
    }),
});

const LoginPage = () => {
    const navigate = useNavigate();
    const { login, isAuthenticated, isLoading, checkAuth } = useAuthStore();
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    useEffect(() => {
        if (!isLoading && isAuthenticated) {
            navigate('/', { replace: true });
        }
    }, [isAuthenticated, isLoading, navigate]);

    const form = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {
            email: "",
            password: "",
        },
    });

    if (isLoading) {
        return (
            <div className="flex h-screen w-full bg-slate-950 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
        );
    }

    const onSubmit = async (values) => {
        setLoading(true);
        setError(null);
        try {
            const result = await login(values.email, values.password);
            if (result.success) {
                navigate('/');
            } else {
                setError(result.error);
            }
        } catch (err) {
            setError('An unexpected error occurred.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-500/30">
            {/* Left Side - Visual/Marketing */}
            <div className="hidden lg:flex flex-1 bg-slate-900 items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-blue-600/10 blur-[100px] rounded-full" />
                <div className="relative z-10 flex flex-col items-center p-12 text-center max-w-lg">
                    <div className="h-24 w-24 bg-blue-600 rounded-3xl flex items-center justify-center mb-8 shadow-2xl shadow-blue-900/50 rotate-3 transition-transform hover:rotate-6 duration-500">
                        <MessageSquare className="h-12 w-12 text-white" />
                    </div>
                    <h1 className="text-4xl font-bold mb-4 tracking-tight">Kiero Agent Workspace</h1>
                    <p className="text-slate-400 text-lg leading-relaxed">
                        Manage customer interactions, track performance, and deliver exceptional support experiences in real-time.
                    </p>
                </div>
            </div>

            {/* Right Side - Login Form */}
            <div className="flex-1 flex items-center justify-center p-6 sm:p-12 md:p-24 relative bg-slate-950">
                <div className="w-full max-w-sm space-y-6">
                    <div className="text-center mb-8 lg:hidden">
                        <div className="h-12 w-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                            <MessageSquare className="h-6 w-6 text-white" />
                        </div>
                        <h1 className="text-2xl font-bold">Welcome Back</h1>
                    </div>

                    <div className="space-y-2 text-center lg:text-left">
                        <h2 className="text-3xl font-bold tracking-tight">Sign in</h2>
                        <p className="text-slate-400">Enter your credentials to access your account</p>
                    </div>

                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-slate-300">Email Address</FormLabel>
                                        <FormControl>
                                            <div className="relative">
                                                <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                                                <Input
                                                    placeholder="name@company.com"
                                                    {...field}
                                                    disabled={loading}
                                                    className="pl-9 bg-slate-900/50 border-slate-800 text-slate-100 placeholder:text-slate-600 focus-visible:ring-blue-600 focus-visible:border-blue-600"
                                                />
                                            </div>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="password"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-slate-300">Password</FormLabel>
                                        <FormControl>
                                            <div className="relative">
                                                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                                                <Input
                                                    type="password"
                                                    placeholder="••••••••"
                                                    {...field}
                                                    disabled={loading}
                                                    className="pl-9 bg-slate-900/50 border-slate-800 text-slate-100 placeholder:text-slate-600 focus-visible:ring-blue-600 focus-visible:border-blue-600"
                                                />
                                            </div>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {error && (
                                <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20 text-sm text-red-500 text-center">
                                    {error}
                                </div>
                            )}

                            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-6" disabled={loading}>
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Sign In
                            </Button>

                            <div className="text-center text-sm text-slate-500 mt-6">
                                Demo: <span className="text-slate-300 font-mono">admin@kiero.id</span> / <span className="text-slate-300 font-mono">password123</span>
                            </div>
                        </form>
                    </Form>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
